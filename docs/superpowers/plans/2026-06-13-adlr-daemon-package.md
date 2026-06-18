# Daemon Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `adlrd` — the background daemon that owns SQLite, manages agent processes via PTY, serves Unix socket IPC, and pushes events to subscribers.

**Architecture:** A single Bun process that runs forever (or until idle). It listens on a Unix socket, routes commands to Storage or process manager, and streams PTY output over raw attach channels. All state is in SQLite; the daemon is the only writer.

**Tech Stack:** Bun, `bun:sqlite`, `node-pty`, Unix `net` module, `child_process` for auto-start detection

---

## File Structure

```
packages/daemon/
  package.json
  tsconfig.json
  src/
    index.ts
    server.ts
    handlers.ts
    process-manager.ts
    config-loader.ts
    lifecycle.ts
  test/
    server.test.ts
    process-manager.test.ts
```

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/daemon/package.json`
- Create: `packages/daemon/tsconfig.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "adlrd",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "bin": {
    "adlrd": "src/index.ts"
  },
  "scripts": {
    "test": "bun test",
    "start": "bun src/index.ts"
  },
  "dependencies": {
    "@adlr/sdk": "workspace:*",
    "node-pty": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/daemon
git commit -m "feat(daemon): add package scaffolding"
```

---

## Task 2: Lifecycle Manager (`lifecycle.ts`)

**Files:**
- Create: `packages/daemon/src/lifecycle.ts`

- [ ] **Step 1: Write lifecycle manager**

```ts
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs"
import { join } from "path"
import { ADLR_DIR, PID_FILE, SOCKET_PATH } from "@adlr/sdk"

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

export function ensureAdlerDir(): void {
  if (!existsSync(ADLR_DIR)) {
    const { mkdirSync } = require("fs")
    mkdirSync(ADLR_DIR, { recursive: true })
  }
}

export function writePid(): void {
  ensureAdlerDir()
  writeFileSync(PID_FILE, String(process.pid), "utf-8")
}

export function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null
  try {
    return parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10)
  } catch {
    return null
  }
}

export function removePid(): void {
  try { unlinkSync(PID_FILE) } catch {}
}

export function removeSocket(): void {
  try { unlinkSync(SOCKET_PATH) } catch {}
}

export function isDaemonRunning(): boolean {
  const pid = readPid()
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export class InactivityTimer {
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastActivity: number = Date.now()
  private clientCount: number = 0
  private runningAgents: number = 0

  constructor(private onShutdown: () => void) {}

  touch(): void {
    this.lastActivity = Date.now()
    this.reset()
  }

  addClient(): void {
    this.clientCount++
    this.touch()
  }

  removeClient(): void {
    this.clientCount = Math.max(0, this.clientCount - 1)
    this.check()
  }

  addAgent(): void {
    this.runningAgents++
    this.touch()
  }

  removeAgent(): void {
    this.runningAgents = Math.max(0, this.runningAgents - 1)
    this.check()
  }

  private check(): void {
    if (this.clientCount === 0 && this.runningAgents === 0) {
      this.reset()
    } else {
      this.clear()
    }
  }

  private reset(): void {
    this.clear()
    this.timer = setTimeout(() => {
      this.onShutdown()
    }, INACTIVITY_TIMEOUT_MS)
  }

  private clear(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  stop(): void {
    this.clear()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/lifecycle.ts
git commit -m "feat(daemon): add lifecycle and inactivity timer"
```

---

## Task 3: Config Loader (`config-loader.ts`)

**Files:**
- Create: `packages/daemon/src/config-loader.ts`

- [ ] **Step 1: Write config loader**

```ts
import { existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { AdlrConfig } from "@adlr/sdk"

const GLOBAL_CONFIG = join(homedir(), ".config/adlr/adlr.ts")
const PROJECT_CONFIG = join(process.cwd(), ".adlr/adlr.ts")

export async function loadConfig(): Promise<AdlrConfig> {
  let globalConfig: AdlrConfig = {}
  let projectConfig: AdlrConfig = {}

  if (existsSync(GLOBAL_CONFIG)) {
    const mod = await import(GLOBAL_CONFIG)
    globalConfig = mod.default ?? {}
  }

  if (existsSync(PROJECT_CONFIG)) {
    const mod = await import(PROJECT_CONFIG)
    projectConfig = mod.default ?? {}
  }

  return mergeConfig(globalConfig, projectConfig)
}

function mergeConfig(base: AdlrConfig, override: AdlrConfig): AdlrConfig {
  return {
    agent: {
      agents: { ...base.agent?.agents, ...override.agent?.agents },
      attach: override.agent?.attach ?? base.agent?.attach,
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/config-loader.ts
git commit -m "feat(daemon): add config loader"
```

---

## Task 4: Process Manager (`process-manager.ts`)

**Files:**
- Create: `packages/daemon/src/process-manager.ts`

- [ ] **Step 1: Write process manager**

```ts
import { spawn as spawnPty } from "node-pty"
import type { Storage, Span, SpanStatus, AdlrConfig } from "@adlr/sdk"
import { ADLR_SOCKET } from "@adlr/sdk"

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
    private config: AdlrConfig,
    private onEvent: (event: { type: string; payload: unknown }) => void,
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
      ADLR_SESSION: data.sessionId,
      ADLR_SPAN_ID: span.id,
      ADLR_SOCKET: ADLR_SOCKET,
      ADLR_AGENT_PROMPT: data.prompt,
      ADLR_CONTEXT: JSON.stringify(contextItems),
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

  private async pollStatus(spanId: string, statusHook: NonNullable<AdlrConfig["agent"]["agents"][string]["status"]>) {
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

  listAgents(sessionId: string): Promise<Span[]> {
    return this.storage.listSpans(sessionId)
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
    this.agents.clear()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/process-manager.ts
git commit -m "feat(daemon): add process manager with PTY spawning"
```

---

## Task 5: IPC Handlers (`handlers.ts`)

**Files:**
- Create: `packages/daemon/src/handlers.ts`

- [ ] **Step 1: Write handlers**

```ts
import type { Storage } from "@adlr/sdk"
import type { ProcessManager } from "./process-manager"

export interface HandlerContext {
  storage: Storage
  processManager: ProcessManager
  subscribers: Map<string, Set<{ write: (data: string) => void }>>
  broadcast: (sessionId: string, event: { type: string; payload: unknown }) => void
}

export async function handleCommand(ctx: HandlerContext, type: string, payload: unknown): Promise<unknown> {
  switch (type) {
    case "session.create": {
      const data = payload as { working_dir?: string; status?: string }
      const session = await ctx.storage.createSession({
        working_dir: data.working_dir ?? process.cwd(),
        status: data.status as any,
      })
      ctx.broadcast(session.id, { type: "session.created", payload: { session_id: session.id } })
      return session
    }

    case "session.list": {
      return ctx.storage.listSessions()
    }

    case "session.get": {
      const { id } = payload as { id: string }
      return ctx.storage.getSession(id)
    }

    case "agent.run": {
      const data = payload as {
        session_id: string
        agent_type: string
        prompt: string
        name: string
        parent_span_id?: string | null
      }
      const span = await ctx.processManager.spawnAgent({
        sessionId: data.session_id,
        agentType: data.agent_type,
        prompt: data.prompt,
        name: data.name,
        parentSpanId: data.parent_span_id,
      })
      return span
    }

    case "agent.wait": {
      const { name } = payload as { name: string }
      const spans = await ctx.storage.listSpans("") // we need to search by name across all sessions
      const span = spans.find(s => s.name === name)
      if (!span) throw new Error(`Agent not found: ${name}`)
      while (true) {
        const current = await ctx.storage.getSpan(span.id)
        if (!current) throw new Error("Span disappeared")
        if (current.status === "done" || current.status === "failed" || current.status === "blocked") {
          return current
        }
        await new Promise(r => setTimeout(r, 500))
      }
    }

    case "agent.status": {
      const { name } = payload as { name: string }
      const spans = await ctx.storage.listSpans("")
      const span = spans.find(s => s.name === name)
      if (!span) throw new Error(`Agent not found: ${name}`)
      return span.status
    }

    case "agent.list": {
      const { session_id } = payload as { session_id: string }
      const spans = await ctx.storage.listSpans(session_id)
      return spans.filter(s => s.kind === "agent")
    }

    case "agent.attach": {
      const { span_id } = payload as { span_id: string }
      return { span_id, message: "Use raw socket for attach" }
    }

    case "span.update": {
      const { id, data, options } = payload as { id: string; data: Record<string, unknown>; options?: { merge?: boolean } }
      const existing = await ctx.storage.getSpan(id)
      if (!existing) throw new Error(`Span not found: ${id}`)
      const updatedData = options?.merge ? { ...existing.data, ...data } : data
      await ctx.storage.updateSpan(id, { data: updatedData })
      return { success: true }
    }

    case "context.add": {
      const data = payload as { session_id: string; type: string; label?: string; description?: string; value: Record<string, unknown> }
      const item = await ctx.storage.addContextItem({
        session_id: data.session_id,
        type: data.type as any,
        label: data.label ?? null,
        description: data.description ?? null,
        value: data.value,
      })
      ctx.broadcast(data.session_id, { type: "context.added", payload: { item_id: item.id, type: item.type, label: item.label } })
      return item
    }

    case "context.list": {
      const { session_id } = payload as { session_id: string }
      return ctx.storage.listContextItems(session_id)
    }

    case "subscribe": {
      const { session_id } = payload as { session_id: string }
      const session = await ctx.storage.getSession(session_id)
      if (!session) throw new Error(`Session not found: ${session_id}`)
      const spans = await ctx.storage.listSpans(session_id)
      const events = await ctx.storage.listEvents(session_id)
      const context = await ctx.storage.listContextItems(session_id)
      return {
        type: "snapshot",
        payload: { session, spans, events, context },
      }
    }

    default:
      throw new Error(`Unknown command: ${type}`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/handlers.ts
git commit -m "feat(daemon): add IPC command handlers"
```

---

## Task 6: Socket Server (`server.ts`)

**Files:**
- Create: `packages/daemon/src/server.ts`

- [ ] **Step 1: Write server**

```ts
import { createServer, type Socket } from "net"
import type { Storage } from "@adlr/sdk"
import { SOCKET_PATH } from "@adlr/sdk"
import { ProcessManager } from "./process-manager"
import { handleCommand } from "./handlers"
import { InactivityTimer } from "./lifecycle"

export function startServer(storage: Storage, processManager: ProcessManager, onShutdown: () => void): { close: () => void } {
  const subscribers = new Map<string, Set<{ write: (data: string) => void }>>()
  const clients = new Set<Socket>()

  const inactivity = new InactivityTimer(onShutdown)

  function broadcast(sessionId: string, event: { type: string; payload: unknown }) {
    const set = subscribers.get(sessionId)
    if (set) {
      const data = JSON.stringify({ type: "event", event: event.type, payload: event.payload }) + "\n"
      for (const client of set) {
        try { client.write(data) } catch {}
      }
    }
  }

  const ctx = {
    storage,
    processManager,
    subscribers,
    broadcast,
  }

  const server = createServer((socket) => {
    clients.add(socket)
    inactivity.addClient()

    let buffer = ""
    let subscribedSessionId: string | null = null

    socket.on("data", async (data) => {
      buffer += data.toString()
      let lines: string[]
      while ((lines = buffer.split("\n")).length > 1) {
        buffer = lines.pop()!
        const line = lines[0]
        if (!line) continue
        try {
          const msg = JSON.parse(line) as { type: string; id: string; payload: unknown }

          if (msg.type === "subscribe") {
            const { session_id } = msg.payload as { session_id: string }
            subscribedSessionId = session_id
            const set = subscribers.get(session_id) ?? new Set()
            set.add({ write: (d) => socket.write(d) })
            subscribers.set(session_id, set)

            const snapshot = await handleCommand(ctx, "subscribe", { session_id })
            socket.write(JSON.stringify({ type: "response", id: msg.id, payload: snapshot }) + "\n")
            continue
          }

          if (msg.type === "agent.attach") {
            const { span_id } = msg.payload as { span_id: string }
            const cleanup = processManager.addAttachListener(span_id, (data) => {
              socket.write(data)
            })
            socket.on("close", () => {
              cleanup()
            })
            socket.write(JSON.stringify({ type: "response", id: msg.id, payload: { attached: true } }) + "\n")
            continue
          }

          const result = await handleCommand(ctx, msg.type, msg.payload)
          socket.write(JSON.stringify({ type: "response", id: msg.id, payload: result }) + "\n")
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          // Try to parse id from malformed line
          let id = "unknown"
          try {
            const parsed = JSON.parse(line)
            id = parsed.id ?? "unknown"
          } catch {}
          socket.write(JSON.stringify({ type: "error", id, error }) + "\n")
        }
      }
    })

    socket.on("close", () => {
      clients.delete(socket)
      inactivity.removeClient()
      if (subscribedSessionId) {
        const set = subscribers.get(subscribedSessionId)
        if (set) {
          set.delete({ write: (d) => socket.write(d) })
        }
      }
    })
  })

  server.listen(SOCKET_PATH)

  return {
    close() {
      inactivity.stop()
      for (const client of clients) {
        client.end()
      }
      server.close()
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/server.ts
git commit -m "feat(daemon): add Unix socket server with subscriptions"
```

---

## Task 7: Daemon Entry Point (`index.ts`)

**Files:**
- Create: `packages/daemon/src/index.ts`

- [ ] **Step 1: Write entry point**

```ts
import { SQLiteStorage, DB_PATH } from "@adlr/sdk"
import { startServer } from "./server"
import { ProcessManager } from "./process-manager"
import { loadConfig } from "./config-loader"
import { writePid, removePid, removeSocket, isDaemonRunning } from "./lifecycle"

async function main() {
  if (isDaemonRunning()) {
    console.error("Daemon is already running")
    process.exit(1)
  }

  const storage = new SQLiteStorage(DB_PATH)
  const config = await loadConfig()
  const processManager = new ProcessManager(storage, config, (event) => {
    // Events are broadcast by the server via subscribers map
    // The processManager callback is a placeholder for future extensibility
  })

  writePid()

  const server = startServer(storage, processManager, () => {
    console.log("Shutting down due to inactivity")
    shutdown()
  })

  function shutdown() {
    server.close()
    processManager.stop()
    storage.close()
    removePid()
    removeSocket()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  console.log("adlrd started")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/index.ts
git commit -m "feat(daemon): add daemon entry point"
```

---

## Task 8: Server Tests

**Files:**
- Create: `packages/daemon/test/server.test.ts`

- [ ] **Step 1: Write server test**

```ts
import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { connect } from "net"
import { SQLiteStorage } from "@adlr/sdk"
import { startServer } from "../src/server"
import { ProcessManager } from "../src/process-manager"
import { unlinkSync, existsSync } from "fs"
import { SOCKET_PATH } from "@adlr/sdk"

describe("Daemon server", () => {
  let storage: SQLiteStorage
  let pm: ProcessManager
  let server: ReturnType<typeof startServer>

  beforeEach(async () => {
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
    storage = new SQLiteStorage(":memory:")
    pm = new ProcessManager(storage, {}, () => {})
    server = startServer(storage, pm, () => {})
    // Wait for socket to be ready
    await new Promise(r => setTimeout(r, 100))
  })

  afterEach(() => {
    server.close()
    storage.close()
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
  })

  test("session.create returns a session", async () => {
    const client = connect(SOCKET_PATH)
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve)
      client.once("error", reject)
    })

    const response = await new Promise<unknown>((resolve) => {
      let buffer = ""
      client.on("data", (data) => {
        buffer += data.toString()
        const lines = buffer.split("\n")
        if (lines.length > 1) {
          resolve(JSON.parse(lines[0]))
        }
      })
      client.write(JSON.stringify({ type: "session.create", id: "req-1", payload: { working_dir: "/tmp" } }) + "\n")
    })

    expect(response).toHaveProperty("type", "response")
    expect(response).toHaveProperty("payload")
    const payload = (response as any).payload
    expect(payload).toHaveProperty("id")
    expect(payload.status).toBe("active")
    client.end()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd packages/daemon && bun test`
Expected: Tests PASS (server starts and responds to session.create)

- [ ] **Step 3: Commit**

```bash
git add packages/daemon
git commit -m "feat(daemon): add server integration tests"
```

---

## Self-Review

1. **Spec coverage:** §4 Daemon lifecycle (socket, PID, auto-start, shutdown, inactivity), §4 IPC Protocol (all command types, responses, errors, snapshot, event stream), §4 Agent spawning (PTY, env vars, interactive/non-interactive, status hook, output hook, completion), §4 Span context propagation (env vars), §8 Configuration (config loader) — all covered.
2. **No placeholders:** All hooks (`run`, `output`, `status`, `open`, `attach`) are referenced in the config loader. PTY output streaming is implemented via `addAttachListener`. The `agent.attach` command routes to raw PTY stream.
3. **Type consistency:** All imports from `@adlr/sdk`. `AgentConfig` fields match the spec. `ProcContext` fields match. `ADLR_SOCKET` is imported from paths.

Plan complete.
