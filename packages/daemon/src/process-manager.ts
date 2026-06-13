import { spawn as spawnPty } from "node-pty"
import type { Storage, Span, SpanStatus, AdlerConfig } from "@adler/sdk"
import { SOCKET_PATH } from "@adler/sdk"
import type { InactivityTimer } from "./lifecycle"

export interface AgentProcess {
  spanId: string
  pty: ReturnType<typeof spawnPty>
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
    private config: AdlerConfig,
    private onEvent: (event: { type: string; payload: unknown }) => void,
    private inactivity?: InactivityTimer,
  ) {}

  async spawnAgent(data: {
    sessionId: string
    agentType: string
    prompt: string
    name: string
    parentSpanId?: string | null
  }): Promise<Span> {
    const agentDef = this.config.agent?.agents?.[data.agentType]
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

    const pty = spawnPty(runCmd, [], {
      env,
      cwd: process.cwd(),
    })

    const agent: AgentProcess = {
      spanId: span.id,
      pty,
      stdoutBuffer: "",
      lastStdoutTime: Date.now(),
      stdoutIdle: false,
      status: "running",
      exited: false,
      exitCode: null,
    }

    this.agents.set(span.id, agent)
    this.inactivity?.addAgent()

    pty.onData((data) => {
      agent.stdoutBuffer += data
      if (agent.stdoutBuffer.length > 4096) {
        agent.stdoutBuffer = agent.stdoutBuffer.slice(-4096)
      }
      agent.lastStdoutTime = Date.now()
      agent.stdoutIdle = false

      const listeners = this.attachListeners.get(span.id)
      if (listeners) {
        for (const cb of listeners) {
          cb(Buffer.from(data))
        }
      }
    })

    pty.onExit(async ({ exitCode }) => {
      agent.exited = true
      agent.exitCode = exitCode ?? null
      await this.completeAgent(span.id, exitCode ?? 0)
    })

    if (agentDef.interactive) {
      const interval = agentDef.statusPollInterval ?? 3000
      if (agentDef.status) {
        this.statusIntervals.set(span.id, setInterval(() => {
          this.pollStatus(span.id, agentDef.status!)
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

  private async pollStatus(spanId: string, statusHook: NonNullable<AdlerConfig["agent"]["agents"][string]["status"]>) {
    const agent = this.agents.get(spanId)
    if (!agent || agent.exited) return

    const span = await this.storage.getSpan(spanId)
    if (!span) return

    const timeout = this.config.agent?.agents?.[span.data.agent_type as string]?.interactiveTimeout ?? 3000
    agent.stdoutIdle = Date.now() - agent.lastStdoutTime > timeout

    const result = await statusHook({
      span,
      currentStatus: agent.status,
      proc: { stdoutIdle: agent.stdoutIdle, lastStdout: agent.stdoutBuffer },
      $: {} as unknown,
    })

    if (result === "completed" || result === "failed" || result === "blocked") {
      await this.completeAgent(spanId, result === "completed" ? 0 : result === "failed" ? 1 : 0, result)
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

    const agentDef = this.config.agent?.agents?.[span.data.agent_type as string]
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
        // output hook failure is non-fatal
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
    for (const [spanId, interval] of this.statusIntervals) {
      clearInterval(interval)
      const agent = this.agents.get(spanId)
      if (agent) {
        agent.pty.kill()
      }
    }
    this.statusIntervals.clear()
    for (const _ of this.agents.keys()) {
      this.inactivity?.removeAgent()
    }
    this.agents.clear()
  }
}
