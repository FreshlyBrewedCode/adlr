import type { Storage, Span, SpanStatus } from "@adler/sdk"
import { SOCKET_PATH } from "@adler/sdk"
import type { InactivityTimer } from "./lifecycle"
import type { ConfigLoader } from "./config-loader"
import type { DaemonLogger } from "./logger"

export interface AgentProcess {
  spanId: string
  proc: Bun.Subprocess
  terminal: Bun.Terminal
  stdoutBuffer: string
  lastStdoutTime: number
  stdoutIdle: boolean
  status: SpanStatus
  exited: boolean
  exitCode: number | null
}

export class ProcessManager {
  private agents = new Map<string, AgentProcess>()
  private attachListeners = new Map<string, Set<(data: Buffer) => void>>()
  private statusIntervals = new Map<string, ReturnType<typeof setInterval>>()

  constructor(
    private storage: Storage,
    private configLoader: ConfigLoader,
    private onEvent: (event: { type: string; payload: unknown }) => void,
    private inactivity?: InactivityTimer,
    private logger?: DaemonLogger,
  ) {}

  async spawnAgent(data: {
    sessionId: string
    agentType: string
    prompt: string
    name: string
    parentSpanId?: string | null
  }): Promise<Span> {
    const session = await this.storage.getSession(data.sessionId)
    if (!session) {
      throw new Error(`Session not found: ${data.sessionId}`)
    }

    const config = await this.configLoader.loadConfig(session.working_dir)
    const agentDef = config.agent?.agents?.[data.agentType]
    if (!agentDef) {
      throw new Error(`Unknown agent type: ${data.agentType}`)
    }

    const runCmd = agentDef.run?.({ prompt: data.prompt, subagent: data.agentType.split(":")[1] })
    if (!runCmd) {
      throw new Error(`Agent ${data.agentType} has no run hook`)
    }

    const span = await this.storage.createSpan({
      session_id: data.sessionId,
      parent_id: data.parentSpanId ?? null,
      kind: "agent",
      name: data.name,
      status: "running",
      data: { prompt: data.prompt, agent_type: data.agentType, pid: null, exit_code: null },
    })

    const contextItems = await this.storage.listContextItems(data.sessionId)
    const env = {
      ...process.env,
      ADLER_SESSION: data.sessionId,
      ADLER_SPAN_ID: span.id,
      ADLER_SOCKET: SOCKET_PATH,
      ADLER_AGENT_PROMPT: data.prompt,
      ADLER_CONTEXT: JSON.stringify(contextItems),
    }

    // Declare agent before spawn so terminal callbacks can close over it
    let agent: AgentProcess
    const attachListeners = this.attachListeners

    let proc: Bun.Subprocess
    try {
      proc = Bun.spawn(["sh", "-c", runCmd], {
        env: env as Record<string, string>,
        cwd: session.working_dir,
        terminal: {
          cols: 80,
          rows: 24,
          data(_terminal, data) {
            const str = Buffer.from(data).toString()
            agent.stdoutBuffer += str
            if (agent.stdoutBuffer.length > 4096) {
              agent.stdoutBuffer = agent.stdoutBuffer.slice(-4096)
            }
            agent.lastStdoutTime = Date.now()
            agent.stdoutIdle = false

            const listeners = attachListeners.get(span.id)
            if (listeners) {
              for (const cb of listeners) {
                cb(Buffer.from(str))
              }
            }
          },
          exit: (_terminal, ptyExitCode, _signal) => {
            // PTY stream closed with error (ptyExitCode 1 = error).
            // Only used as fallback if proc.exited doesn't resolve first.
            // completeAgent is idempotent — it will no-op if proc.exited already ran.
            if (ptyExitCode === 1) {
              this.completeAgent(span.id, 1)
            }
          },
        },
      })
    } catch (err) {
      await this.storage.updateSpan(span.id, {
        status: "failed",
        finished_at: Date.now(),
        data: { ...span.data, exit_code: -1 },
      })
      this.inactivity?.removeAgent()
      throw err
    }

    if (!proc.terminal) {
      proc.kill()
      await this.storage.updateSpan(span.id, {
        status: "failed",
        finished_at: Date.now(),
        data: { ...span.data, exit_code: -1 },
      })
      this.inactivity?.removeAgent()
      throw new Error("Bun.spawn did not create a PTY terminal")
    }

    // Now assign agent — terminal callbacks fire asynchronously, so agent is set before any data arrives
    agent = {
      spanId: span.id,
      proc,
      terminal: proc.terminal,
      stdoutBuffer: "",
      lastStdoutTime: Date.now(),
      stdoutIdle: false,
      status: "running",
      exited: false,
      exitCode: null,
    }

    this.agents.set(span.id, agent)
    this.inactivity?.addAgent()

    this.logger?.info("Agent started", {
      agent: data.agentType,
      command: runCmd,
      args: ["sh", "-c", runCmd],
      cwd: session.working_dir,
    }, { session_id: data.sessionId, span_id: span.id })

    proc.exited.then(async (exitCode) => {
      agent.exited = true
      agent.exitCode = exitCode ?? null
      await this.completeAgent(span.id, exitCode ?? 0)
    }).catch(err => {
      const error = err instanceof Error ? err.message : String(err)
      console.error(`Agent ${span.id} exit handler failed:`, error)
      this.logger?.error("Agent exit handler failed", { agent: span.id, error }, { session_id: data.sessionId, span_id: span.id })
    })

    if (agentDef.interactive) {
      const interval = agentDef.statusPollInterval ?? 3000
      if (agentDef.status) {
        this.statusIntervals.set(span.id, setInterval(() => {
          this.pollStatus(span.id)
        }, interval))
      } else {
        const timeout = agentDef.interactiveTimeout ?? 3000
        this.statusIntervals.set(span.id, setInterval(() => {
          if (Date.now() - agent.lastStdoutTime > timeout) {
            agent.stdoutIdle = true
            this.completeAgent(span.id, 0)
          }
        }, interval))
      }
    }

    this.onEvent({
      type: "span.started",
      payload: { span_id: span.id, kind: "agent", name: data.name },
    })

    return span
  }

  private async pollStatus(spanId: string) {
    const agent = this.agents.get(spanId)
    if (!agent || agent.exited) return

    const span = await this.storage.getSpan(spanId)
    if (!span) return

    const session = await this.storage.getSession(span.session_id)
    if (!session) return

    const config = await this.configLoader.loadConfig(session.working_dir)
    const agentDef = config.agent?.agents?.[span.data.agent_type as string]
    if (!agentDef?.status) return

    const timeout = agentDef?.interactiveTimeout ?? 3000
    agent.stdoutIdle = Date.now() - agent.lastStdoutTime > timeout

    const result = await agentDef.status({
      span,
      currentStatus: agent.status,
      proc: { stdoutIdle: agent.stdoutIdle, lastStdout: agent.stdoutBuffer },
      $: {} as unknown,
    })

    if (result === "completed" || result === "failed" || result === "blocked") {
      await this.completeAgent(spanId, result === "completed" ? 0 : result === "failed" ? 1 : 0, result as SpanStatus)
    }
  }

  private async completeAgent(spanId: string, exitCode: number, forcedStatus?: SpanStatus) {
    const agent = this.agents.get(spanId)
    if (!agent || agent.status === "done" || agent.status === "failed" || agent.status === "blocked") return

    const interval = this.statusIntervals.get(spanId)
    if (interval) {
      clearInterval(interval)
      this.statusIntervals.delete(spanId)
    }

    const span = await this.storage.getSpan(spanId)
    if (!span) return

    const session = await this.storage.getSession(span.session_id)
    if (!session) return

    const config = await this.configLoader.loadConfig(session.working_dir)
    const agentDef = config.agent?.agents?.[span.data.agent_type as string]
    let outputData: Record<string, unknown> | null = null

    if (agentDef?.output) {
      try {
        const output = await agentDef.output({
          span,
          proc: { stdoutIdle: agent.stdoutIdle, lastStdout: agent.stdoutBuffer },
          $: {} as unknown,
        })
        outputData = output as Record<string, unknown>
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        console.error("Agent output hook failed:", error)
        this.logger?.error("Agent output hook failed", { agent: String(span.data.agent_type), error }, { session_id: span.session_id, span_id: spanId })
      }
    }

    const status: SpanStatus = forcedStatus ?? (exitCode === 0 ? "done" : "failed")
    const data: Record<string, unknown> = {
      ...span.data,
      exit_code: exitCode,
    }
    if (outputData) {
      data.output = outputData
    }

    await this.storage.updateSpan(spanId, {
      status,
      finished_at: Date.now(),
      data,
    })

    agent.status = status
    if (status === "done") {
      this.logger?.info("Agent completed", { agent: String(span.data.agent_type), exit_code: exitCode }, { session_id: span.session_id, span_id: spanId })
    } else {
      this.logger?.error("Agent failed", { agent: String(span.data.agent_type), exit_code: exitCode, signal: null }, { session_id: span.session_id, span_id: spanId })
    }
    this.agents.delete(spanId)
    this.attachListeners.delete(spanId)
    this.inactivity?.removeAgent()
    this.onEvent({
      type: status === "done" ? "span.finished" : "span.failed",
      payload: { span_id: spanId, exit_code: exitCode },
    })
  }

  addAttachListener(spanId: string, callback: (data: Buffer) => void): () => void {
    const set = this.attachListeners.get(spanId) ?? new Set()
    set.add(callback)
    this.attachListeners.set(spanId, set)
    return () => {
      set.delete(callback)
    }
  }

  getAgent(spanId: string): AgentProcess | undefined {
    return this.agents.get(spanId)
  }

  async listAgents(sessionId: string): Promise<Span[]> {
    const spans = await this.storage.listSpans(sessionId)
    return spans.filter(s => s.kind === "agent")
  }

  async stop(): Promise<void> {
    for (const interval of this.statusIntervals.values()) {
      clearInterval(interval)
    }
    this.statusIntervals.clear()

    for (const [spanId, agent] of this.agents) {
      try { agent.proc.kill() } catch (e) { /* already exited */ }
      this.agents.delete(spanId)
      this.attachListeners.delete(spanId)
      this.inactivity?.removeAgent()
    }
  }
}
