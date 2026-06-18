# Daemon Structured Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the adlr daemon's operational logs into the structured event logging stack so daemon activity and agent lifecycle events are visible in the TUI's Logs tab.

**Architecture:** A `createLogger(storage)` factory in `packages/daemon/src/logger.ts` returns a `DaemonLogger` object with `info/warn/error` methods. It lazily creates a `"__daemon__"` sentinel session row on first call, then writes all daemon-scoped log events as regular `events` rows. Session-scoped events (agent lifecycle) pass the real `session_id`/`span_id` via an optional `ctx` argument. The TUI gains a `d` key toggle to switch the Logs tab between session events and daemon events.

**Tech Stack:** Bun, TypeScript, bun:sqlite, Ink (React for terminals), bun:test

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `packages/sdk/src/constants.ts` | Export `DAEMON_SESSION_ID = "__daemon__"` |
| Modify | `packages/sdk/src/index.ts` | Re-export from `constants.ts` |
| Create | `packages/daemon/src/logger.ts` | `DaemonLogger` type + `createLogger` factory |
| Create | `packages/daemon/test/logger.test.ts` | Unit tests for `createLogger` |
| Modify | `packages/daemon/src/index.ts` | Instantiate logger, pass to dependents, replace console calls |
| Modify | `packages/daemon/src/server.ts` | Accept `logger` param, replace `console.error` call |
| Modify | `packages/daemon/src/config-loader.ts` | Accept `logger` param, replace console calls, emit load/reload events |
| Modify | `packages/daemon/src/process-manager.ts` | Accept `logger` param, replace console calls, emit agent lifecycle events |
| Modify | `packages/tui/src/types.ts` | Add `logsView` to `AppState`, add `toggleLogsView` action |
| Modify | `packages/tui/src/app.tsx` | Wire `d` key, pass `logsView` + daemon events to `LogsTab`, filter `__daemon__` from session list |
| Modify | `packages/tui/src/components/LogsTab.tsx` | Accept `logsView` prop, show view label |

---

### Task 1: Add `DAEMON_SESSION_ID` constant to SDK

**Files:**
- Create: `packages/sdk/src/constants.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/test/constants.test.ts`:

```ts
import { test, expect } from "bun:test"
import { DAEMON_SESSION_ID } from "../src/constants"

test("DAEMON_SESSION_ID is __daemon__", () => {
  expect(DAEMON_SESSION_ID).toBe("__daemon__")
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/sdk && bun test test/constants.test.ts
```

Expected: FAIL — `Cannot find module '../src/constants'`

- [ ] **Step 3: Create `packages/sdk/src/constants.ts`**

```ts
export const DAEMON_SESSION_ID = "__daemon__"
```

- [ ] **Step 4: Re-export from `packages/sdk/src/index.ts`**

Current `index.ts`:
```ts
export * from "./types"
export * from "./storage"
export * from "./sqlite-storage"
export * from "./paths"
export { createClient, type Client, type IpcMessage } from "./client"
```

Add the new export line after `./paths`:
```ts
export * from "./types"
export * from "./storage"
export * from "./sqlite-storage"
export * from "./paths"
export * from "./constants"
export { createClient, type Client, type IpcMessage } from "./client"
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/sdk && bun test test/constants.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/constants.ts packages/sdk/src/index.ts packages/sdk/test/constants.test.ts
git commit -m "feat(sdk): add DAEMON_SESSION_ID constant"
```

---

### Task 2: Create the `DaemonLogger` module

**Files:**
- Create: `packages/daemon/src/logger.ts`
- Create: `packages/daemon/test/logger.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/daemon/test/logger.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test"
import { SQLiteStorage } from "@adlr/sdk"
import { DAEMON_SESSION_ID } from "@adlr/sdk"
import { createLogger } from "../src/logger"

describe("createLogger", () => {
  let storage: SQLiteStorage

  beforeEach(() => {
    storage = new SQLiteStorage(":memory:")
  })

  test("info writes a log.info event with __daemon__ session on first call", async () => {
    const logger = createLogger(storage)
    await logger.info("test message")

    const events = await storage.listEvents(DAEMON_SESSION_ID)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe("log.info")
    expect(events[0].session_id).toBe(DAEMON_SESSION_ID)
    expect(events[0].span_id).toBeNull()
    expect(events[0].data.message).toBe("test message")
  })

  test("warn writes a log.warn event", async () => {
    const logger = createLogger(storage)
    await logger.warn("something wrong", { path: "/foo" })

    const events = await storage.listEvents(DAEMON_SESSION_ID)
    expect(events[0].type).toBe("log.warn")
    expect(events[0].data.message).toBe("something wrong")
    expect(events[0].data.path).toBe("/foo")
  })

  test("error writes a log.error event", async () => {
    const logger = createLogger(storage)
    await logger.error("crash", { error: "boom" })

    const events = await storage.listEvents(DAEMON_SESSION_ID)
    expect(events[0].type).toBe("log.error")
    expect(events[0].data.error).toBe("boom")
  })

  test("sentinel session is created lazily on first log call", async () => {
    const logger = createLogger(storage)

    // No session yet
    const before = await storage.getSession(DAEMON_SESSION_ID)
    expect(before).toBeNull()

    await logger.info("hello")

    // Session now exists
    const after = await storage.getSession(DAEMON_SESSION_ID)
    expect(after).not.toBeNull()
    expect(after!.id).toBe(DAEMON_SESSION_ID)
  })

  test("sentinel session is only created once across multiple calls", async () => {
    const logger = createLogger(storage)
    await logger.info("first")
    await logger.info("second")
    await logger.warn("third")

    // Only one session row
    const sessions = await storage.listSessions()
    const daemonSessions = sessions.filter(s => s.id === DAEMON_SESSION_ID)
    expect(daemonSessions).toHaveLength(1)

    // Three events
    const events = await storage.listEvents(DAEMON_SESSION_ID)
    expect(events).toHaveLength(3)
  })

  test("ctx overrides session_id and span_id for session-scoped events", async () => {
    // Must create the session first since events FK references sessions
    await storage.createSession({ working_dir: "/tmp" }).then(async (session) => {
      const span = await storage.createSpan({
        session_id: session.id,
        kind: "agent",
        name: "test-agent",
        status: "running",
      })

      const logger = createLogger(storage)
      await logger.info("Agent started", { agent: "opencode" }, { session_id: session.id, span_id: span.id })

      const events = await storage.listEvents(session.id)
      expect(events).toHaveLength(1)
      expect(events[0].session_id).toBe(session.id)
      expect(events[0].span_id).toBe(span.id)
      expect(events[0].type).toBe("log.info")
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/daemon && bun test test/logger.test.ts
```

Expected: FAIL — `Cannot find module '../src/logger'`

- [ ] **Step 3: Create `packages/daemon/src/logger.ts`**

```ts
import type { Storage } from "@adlr/sdk"
import { DAEMON_SESSION_ID } from "@adlr/sdk"

export type LogContext = {
  session_id?: string
  span_id?: string | null
}

export type DaemonLogger = {
  info(message: string, data?: Record<string, unknown>, ctx?: LogContext): Promise<void>
  warn(message: string, data?: Record<string, unknown>, ctx?: LogContext): Promise<void>
  error(message: string, data?: Record<string, unknown>, ctx?: LogContext): Promise<void>
}

export function createLogger(storage: Storage): DaemonLogger {
  let sentinelReady = false

  async function ensureSentinel(): Promise<void> {
    if (sentinelReady) return
    const existing = await storage.getSession(DAEMON_SESSION_ID)
    if (!existing) {
      await storage.createSession({ working_dir: "/" })
        .then(() => {})
        .catch(() => {})
      // Insert directly with the fixed ID since createSession generates a UUID
      // We need to upsert with a known ID — use updateSession after checking
    }
    sentinelReady = true
  }

  async function write(
    level: "log.info" | "log.warn" | "log.error",
    message: string,
    data?: Record<string, unknown>,
    ctx?: LogContext,
  ): Promise<void> {
    const sessionId = ctx?.session_id ?? DAEMON_SESSION_ID
    const spanId = ctx?.span_id ?? null

    if (sessionId === DAEMON_SESSION_ID) {
      await ensureSentinel()
    }

    await storage.createEvent({
      session_id: sessionId,
      span_id: spanId,
      type: level,
      data: { message, ...data },
    })
  }

  return {
    info(message, data, ctx) {
      console.log(`[INFO] ${message}`, data ?? "")
      return write("log.info", message, data, ctx)
    },
    warn(message, data, ctx) {
      console.log(`[WARN] ${message}`, data ?? "")
      return write("log.warn", message, data, ctx)
    },
    error(message, data, ctx) {
      console.error(`[ERROR] ${message}`, data ?? "")
      return write("log.error", message, data, ctx)
    },
  }
}
```

> **Note:** `createSession` in `SQLiteStorage` generates its own UUID. The sentinel session needs a fixed ID of `"__daemon__"`. In the next step you'll add an `upsertDaemonSession` helper directly to `SQLiteStorage` (or use a raw SQL upsert). See Step 4.

- [ ] **Step 4: Add `upsertDaemonSession` to `SQLiteStorage` and update `ensureSentinel`**

The `Storage` interface doesn't need to change — this is an internal helper on `SQLiteStorage`. Add a method after `createSession` in `packages/sdk/src/sqlite-storage.ts`:

```ts
upsertDaemonSession(): void {
  this.db.run(
    `INSERT OR IGNORE INTO sessions (id, status, working_dir, created_at) VALUES (?, ?, ?, ?)`,
    [DAEMON_SESSION_ID, "active", "/", Date.now()]
  )
}
```

Add the import at the top of `sqlite-storage.ts` alongside the other SDK imports:

```ts
import { DAEMON_SESSION_ID } from "./constants"
```

Now update `packages/daemon/src/logger.ts` to use this. Change the `ensureSentinel` function and narrow the `Storage` import:

```ts
import type { Storage } from "@adlr/sdk"
import { DAEMON_SESSION_ID } from "@adlr/sdk"
import type { SQLiteStorage } from "@adlr/sdk"

export type LogContext = {
  session_id?: string
  span_id?: string | null
}

export type DaemonLogger = {
  info(message: string, data?: Record<string, unknown>, ctx?: LogContext): Promise<void>
  warn(message: string, data?: Record<string, unknown>, ctx?: LogContext): Promise<void>
  error(message: string, data?: Record<string, unknown>, ctx?: LogContext): Promise<void>
}

export function createLogger(storage: Storage): DaemonLogger {
  let sentinelReady = false

  function ensureSentinel(): void {
    if (sentinelReady) return
    // SQLiteStorage exposes upsertDaemonSession; cast to access it
    (storage as SQLiteStorage).upsertDaemonSession()
    sentinelReady = true
  }

  async function write(
    level: "log.info" | "log.warn" | "log.error",
    message: string,
    data?: Record<string, unknown>,
    ctx?: LogContext,
  ): Promise<void> {
    const sessionId = ctx?.session_id ?? DAEMON_SESSION_ID
    const spanId = ctx?.span_id ?? null

    if (sessionId === DAEMON_SESSION_ID) {
      ensureSentinel()
    }

    await storage.createEvent({
      session_id: sessionId,
      span_id: spanId,
      type: level,
      data: { message, ...data },
    })
  }

  return {
    info(message, data, ctx) {
      console.log(`[INFO] ${message}`, data ?? "")
      return write("log.info", message, data, ctx)
    },
    warn(message, data, ctx) {
      console.log(`[WARN] ${message}`, data ?? "")
      return write("log.warn", message, data, ctx)
    },
    error(message, data, ctx) {
      console.error(`[ERROR] ${message}`, data ?? "")
      return write("log.error", message, data, ctx)
    },
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/daemon && bun test test/logger.test.ts
```

Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/logger.ts packages/daemon/test/logger.test.ts packages/sdk/src/sqlite-storage.ts packages/sdk/src/constants.ts
git commit -m "feat(daemon): add DaemonLogger with lazy sentinel session"
```

---

### Task 3: Wire logger into `config-loader.ts`

**Files:**
- Modify: `packages/daemon/src/config-loader.ts`

`ConfigLoader` needs to accept an optional `DaemonLogger` (optional so existing tests don't break) and emit structured events instead of/in addition to `console.error`.

- [ ] **Step 1: Update `ConfigLoader` constructor to accept an optional logger**

Replace the full `packages/daemon/src/config-loader.ts` with:

```ts
import { existsSync, watch, type FSWatcher } from "fs"
import { join, resolve } from "path"
import { homedir } from "os"
import type { AdlrConfig } from "@adlr/sdk"
import type { DaemonLogger } from "./logger"

const GLOBAL_CONFIG = join(homedir(), ".config/adlr/adlr.ts")

export class ConfigLoader {
  private cache = new Map<string, AdlrConfig>()
  private watchers = new Map<string, FSWatcher>()

  constructor(private logger?: DaemonLogger) {}

  async loadConfig(dir: string): Promise<AdlrConfig> {
    const absDir = resolve(dir)
    const cached = this.cache.get(absDir)
    if (cached) {
      return cached
    }

    const config = await this.resolveConfig(absDir)
    const files = [GLOBAL_CONFIG, join(absDir, ".adlr/adlr.ts")].filter(existsSync)
    if (Object.keys(config).length === 0 && files.length === 0) {
      return config
    }
    this.cache.set(absDir, config)
    this.watchConfig(absDir)
    return config
  }

  private async resolveConfig(dir: string): Promise<AdlrConfig> {
    let globalConfig: AdlrConfig = {}
    let projectConfig: AdlrConfig = {}
    const globalPath = existsSync(GLOBAL_CONFIG) ? GLOBAL_CONFIG : null
    const projectConfigPath = join(dir, ".adlr/adlr.ts")
    const projectPath = existsSync(projectConfigPath) ? projectConfigPath : null

    if (globalPath) {
      try {
        const mod = await import(`${globalPath}?t=${Date.now()}`)
        globalConfig = mod.default ?? {}
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        console.error(`Failed to load global config ${globalPath}:`, error)
        this.logger?.warn("Failed to load global config", { path: globalPath, error })
      }
    }

    if (projectPath) {
      try {
        const mod = await import(`${projectPath}?t=${Date.now()}`)
        projectConfig = mod.default ?? {}
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        console.error(`Failed to load project config ${projectPath}:`, error)
        this.logger?.warn("Failed to load project config", { path: projectPath, error })
      }
    }

    this.logger?.info("Config loaded", {
      global_path: globalPath,
      project_path: projectPath,
    })

    return mergeConfig(globalConfig, projectConfig)
  }

  private watchConfig(dir: string): void {
    const absDir = resolve(dir)
    if (this.watchers.has(absDir)) return

    const files = [GLOBAL_CONFIG, join(dir, ".adlr/adlr.ts")].filter(existsSync)
    if (files.length === 0) return

    const fileWatchers = files.map((file) =>
      watch(file, (_eventType, _filename) => {
        this.logger?.info("Config reloaded", { path: file })
        this.invalidate(absDir)
      })
    )

    const watcher = {
      close: () => {
        fileWatchers.forEach((w) => w.close())
      },
    } as FSWatcher

    this.watchers.set(absDir, watcher)
  }

  invalidate(dir: string): void {
    const absDir = resolve(dir)
    this.cache.delete(absDir)
    const watcher = this.watchers.get(absDir)
    if (watcher) {
      watcher.close()
      this.watchers.delete(absDir)
    }
  }

  close(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }
    this.watchers.clear()
    this.cache.clear()
  }
}

function mergeConfig(base: AdlrConfig, override: AdlrConfig): AdlrConfig {
  const merged: AdlrConfig = {
    ...base,
    ...override,
  }

  const agents = { ...base.agent?.agents, ...override.agent?.agents }
  const attach = override.agent?.attach ?? base.agent?.attach

  if (Object.keys(agents).length > 0 || attach !== undefined) {
    merged.agent = {
      ...base.agent,
      ...override.agent,
      agents,
      attach,
    }
  }

  return merged
}
```

- [ ] **Step 2: Run existing config-loader tests to verify nothing broke**

```bash
cd packages/daemon && bun test test/config-loader.test.ts
```

Expected: PASS (the constructor now takes optional `logger`, existing tests pass `new ConfigLoader()` with no args)

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/config-loader.ts
git commit -m "feat(daemon): emit structured log events from ConfigLoader"
```

---

### Task 4: Wire logger into `process-manager.ts`

**Files:**
- Modify: `packages/daemon/src/process-manager.ts`

`ProcessManager` needs to accept an optional `DaemonLogger` and emit agent lifecycle events (session-scoped) plus replace existing `console.error` calls.

- [ ] **Step 1: Add logger to `ProcessManager` constructor and update call sites**

In `packages/daemon/src/process-manager.ts`, make these changes:

1. Add the import at the top:
```ts
import type { DaemonLogger } from "./logger"
```

2. Update the constructor signature (add `logger` as last optional param after `inactivity`):
```ts
constructor(
  private storage: Storage,
  private configLoader: ConfigLoader,
  private onEvent: (event: { type: string; payload: unknown }) => void,
  private inactivity?: InactivityTimer,
  private logger?: DaemonLogger,
) {}
```

3. In `spawnAgent`, after the span is created and the proc is successfully spawned and `agent` is assigned (after `this.agents.set(span.id, agent)` and before the `proc.exited.then(...)` block), add:
```ts
this.logger?.info("Agent started", {
  agent: data.agentType,
  command: runCmd,
  args: ["sh", "-c", runCmd],
  cwd: session.working_dir,
}, { session_id: data.sessionId, span_id: span.id })
```

4. In `server.ts`, the `agent.attach` handler calls `getProcessManager().addAttachListener(...)`. The attach log should live in `ProcessManager.addAttachListener` — but we don't have the span context there easily. Instead, log it in `server.ts` after wiring (see Task 5).

5. In the `proc.exited.then(...)` `.catch` handler (line 152), replace:
```ts
console.error(`Agent ${span.id} exit handler failed:`, err instanceof Error ? err.message : String(err))
```
with:
```ts
const error = err instanceof Error ? err.message : String(err)
console.error(`Agent ${span.id} exit handler failed:`, error)
this.logger?.error("Agent exit handler failed", { agent: span.id, error }, { session_id: data.sessionId, span_id: span.id })
```

6. In `completeAgent`, after `agent.status = status` and before `this.agents.delete(spanId)`, add the completion log. First get the `session_id` — it's available from `span.session_id`:
```ts
if (status === "done") {
  this.logger?.info("Agent completed", { agent: String(span.data.agent_type), exit_code: exitCode }, { session_id: span.session_id, span_id: spanId })
} else {
  this.logger?.error("Agent failed", { agent: String(span.data.agent_type), exit_code: exitCode, signal: null }, { session_id: span.session_id, span_id: spanId })
}
```

7. In the `agentDef.output` catch block (line 238), replace:
```ts
console.error("Agent output hook failed:", e instanceof Error ? e.message : String(e))
```
with:
```ts
const error = e instanceof Error ? e.message : String(e)
console.error("Agent output hook failed:", error)
this.logger?.error("Agent output hook failed", { agent: String(span.data.agent_type), error }, { session_id: span.session_id, span_id: spanId })
```

- [ ] **Step 2: Run existing process-manager tests to verify nothing broke**

```bash
cd packages/daemon && bun test test/process-manager.test.ts
```

Expected: PASS (constructor takes optional `logger` as last param, existing `new ProcessManager(storage, configLoader, () => {})` calls still work)

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/process-manager.ts
git commit -m "feat(daemon): emit structured log events from ProcessManager"
```

---

### Task 5: Wire logger into `server.ts`

**Files:**
- Modify: `packages/daemon/src/server.ts`

`startServer` needs to accept a `DaemonLogger` and use it for the broadcast error and for the client attach log.

- [ ] **Step 1: Update `startServer` signature and call sites**

In `packages/daemon/src/server.ts`:

1. Add the import:
```ts
import type { DaemonLogger } from "./logger"
```

2. Update `startServer` signature to accept an optional logger as last param:
```ts
export function startServer(
  storage: Storage,
  getProcessManager: () => ProcessManager,
  inactivity: InactivityTimer,
  logger?: DaemonLogger,
): { close: () => void; broadcast: (sessionId: string, event: { type: string; payload: unknown }) => void }
```

3. In the `broadcast` function, replace the `console.error` call:
```ts
function broadcast(sessionId: string, event: { type: string; payload: unknown }) {
  const set = subscribers.get(sessionId)
  if (set) {
    const data = JSON.stringify({ type: "event", event: event.type, payload: event.payload }) + "\n"
    for (const client of set) {
      try { client.write(data) } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        console.error("Failed to broadcast to client:", error)
        logger?.error("Failed to broadcast to client", { error })
      }
    }
  }
}
```

4. In the `agent.attach` block (after `rawMode = true`), add the attach log. The span_id and session_id are available: first look up the span to get session_id. Since this is async context, do it async:
```ts
if (msg.type === "agent.attach") {
  const { span_id } = msg.payload as { span_id: string }
  if (attachCleanup) {
    attachCleanup()
    attachCleanup = null
  }
  attachCleanup = getProcessManager().addAttachListener(span_id, (data) => {
    socket.write(data)
  })
  rawMode = true
  attachedSpanId = span_id
  socket.write(JSON.stringify({ type: "response", id: msg.id, payload: { attached: true } }) + "\n")

  // Log the attach event (fire-and-forget, don't block response)
  storage.getSpan(span_id).then(span => {
    if (span) {
      logger?.info("Client attached to agent", {
        agent: String(span.data.agent_type ?? span.name),
      }, { session_id: span.session_id, span_id: span.id })
    }
  }).catch(() => {})
  continue
}
```

- [ ] **Step 2: Run existing server tests to verify nothing broke**

```bash
cd packages/daemon && bun test test/server.test.ts
```

Expected: PASS (`startServer` takes optional `logger` as last param, existing test calls still work)

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/server.ts
git commit -m "feat(daemon): emit structured log events from server broadcast and attach"
```

---

### Task 6: Wire everything together in `index.ts`

**Files:**
- Modify: `packages/daemon/src/index.ts`

- [ ] **Step 1: Update `index.ts` to instantiate logger and pass it to all dependents**

Replace `packages/daemon/src/index.ts` with:

```ts
import { SQLiteStorage, DB_PATH } from "@adlr/sdk"
import { startServer } from "./server"
import { ProcessManager } from "./process-manager"
import { ConfigLoader } from "./config-loader"
import { createLogger } from "./logger"
import { writePid, removePid, removeSocket, isDaemonRunning, InactivityTimer, ensureAdlerDir } from "./lifecycle"

async function main() {
  if (isDaemonRunning()) {
    console.error("Daemon is already running")
    process.exit(1)
  }

  ensureAdlerDir()

  const storage = new SQLiteStorage(DB_PATH)
  const logger = createLogger(storage)
  const configLoader = new ConfigLoader(logger)

  const inactivity = new InactivityTimer(() => {
    logger.info("Shutting down due to inactivity")
    shutdown()
  })

  let processManager: ProcessManager

  const server = startServer(storage, () => processManager, inactivity, logger)

  processManager = new ProcessManager(storage, configLoader, (event) => {
    const payload = event.payload as Record<string, unknown> | undefined
    const sessionId = payload?.session_id as string | undefined
    if (sessionId) {
      server.broadcast(sessionId, event)
    }
  }, inactivity, logger)

  writePid()

  function shutdown() {
    server.close()
    processManager.stop()
    inactivity.stop()
    storage.close()
    configLoader.close()
    removePid()
    removeSocket()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  await logger.info("adlrd started")
}

main().catch(async (err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Run all daemon tests**

```bash
cd packages/daemon && bun test
```

Expected: PASS (all test files)

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/index.ts
git commit -m "feat(daemon): wire DaemonLogger into all daemon components"
```

---

### Task 7: TUI — add `logsView` state and `d` key toggle

**Files:**
- Modify: `packages/tui/src/types.ts`
- Modify: `packages/tui/src/app.tsx`
- Modify: `packages/tui/src/components/LogsTab.tsx`

- [ ] **Step 1: Add `logsView` to `AppState` in `packages/tui/src/types.ts`**

Replace the full file with:

```ts
import type { Session, Span, Event, ContextItem } from "@adlr/sdk"

export interface AppState {
  session: Session | null
  spans: Span[]
  events: Event[]
  context: ContextItem[]
  activeTab: number
  isHelpOpen: boolean
  agentsSelectedIndex: number
  tracesSelectedIndex: number
  logsSelectedIndex: number
  logsFilter: "all" | "info" | "warn" | "error"
  logsAutoScroll: boolean
  logsView: "session" | "daemon"
  daemonEvents: Event[]
}

export type AppAction =
  | { type: "setState"; payload: Partial<AppState> }
  | { type: "snapshot"; payload: { session: Session; spans: Span[]; events: Event[]; context: ContextItem[] } }
  | { type: "event"; payload: Event }
  | { type: "daemonEvent"; payload: Event }
  | { type: "daemonSnapshot"; payload: Event[] }
  | { type: "nextTab" }
  | { type: "prevTab" }
  | { type: "setTab"; tab: number }
  | { type: "toggleHelp" }
  | { type: "selectAgent"; index: number }
  | { type: "selectTrace"; index: number }
  | { type: "selectLog"; index: number }
  | { type: "setLogsFilter"; filter: "all" | "info" | "warn" | "error" }
  | { type: "toggleLogsAutoScroll" }
  | { type: "toggleLogsView" }

export const initialState: AppState = {
  session: null,
  spans: [],
  events: [],
  context: [],
  activeTab: 0,
  isHelpOpen: false,
  agentsSelectedIndex: 0,
  tracesSelectedIndex: 0,
  logsSelectedIndex: 0,
  logsFilter: "all",
  logsAutoScroll: true,
  logsView: "session",
  daemonEvents: [],
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "setState":
      return { ...state, ...action.payload }
    case "snapshot":
      return {
        ...state,
        session: action.payload.session,
        spans: action.payload.spans,
        events: action.payload.events,
        context: action.payload.context,
      }
    case "event":
      return { ...state, events: [action.payload, ...state.events] }
    case "daemonEvent":
      return { ...state, daemonEvents: [action.payload, ...state.daemonEvents] }
    case "daemonSnapshot":
      return { ...state, daemonEvents: action.payload }
    case "nextTab":
      return { ...state, activeTab: Math.min(4, state.activeTab + 1) }
    case "prevTab":
      return { ...state, activeTab: Math.max(0, state.activeTab - 1) }
    case "setTab":
      return { ...state, activeTab: action.tab }
    case "toggleHelp":
      return { ...state, isHelpOpen: !state.isHelpOpen }
    case "selectAgent":
      return { ...state, agentsSelectedIndex: action.index }
    case "selectTrace":
      return { ...state, tracesSelectedIndex: action.index }
    case "selectLog":
      return { ...state, logsSelectedIndex: action.index }
    case "setLogsFilter":
      return { ...state, logsFilter: action.filter, logsSelectedIndex: 0 }
    case "toggleLogsAutoScroll":
      return { ...state, logsAutoScroll: !state.logsAutoScroll }
    case "toggleLogsView":
      return { ...state, logsView: state.logsView === "session" ? "daemon" : "session", logsSelectedIndex: 0 }
    default:
      return state
  }
}
```

- [ ] **Step 2: Update `LogsTab.tsx` to accept `logsView` prop and show label**

Replace `packages/tui/src/components/LogsTab.tsx` with:

```tsx
import { Box, Text } from "ink"
import type { Event } from "@adlr/sdk"

function levelFromType(type: string): "info" | "warn" | "error" | "other" {
  if (type.startsWith("log.info")) return "info"
  if (type.startsWith("log.warn")) return "warn"
  if (type.startsWith("log.error")) return "error"
  return "other"
}

const LEVEL_COLORS: Record<string, string> = {
  info: "green",
  warn: "yellow",
  error: "red",
  other: "white",
}

export function LogsTab({
  events,
  selectedIndex,
  filter,
  logsView,
}: {
  events: Event[]
  selectedIndex: number
  filter: "all" | "info" | "warn" | "error"
  logsView: "session" | "daemon"
}) {
  const filtered = events.filter(e => {
    if (filter === "all") return true
    return levelFromType(e.type) === filter
  })

  const display = filtered.slice(0, 50)
  const safeIndex = Math.min(selectedIndex, display.length - 1)

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>View: </Text>
        <Text color={logsView === "session" ? "cyan" : "magenta"}>
          {logsView === "session" ? "[Session]" : "[Daemon]"}
        </Text>
        <Text dimColor>  d=toggle  i/w/e=filter  f=autoscroll</Text>
      </Box>
      {display.map((event, i) => {
        const isSelected = i === safeIndex
        const level = levelFromType(event.type)
        const message = (event.data?.message as string) ?? JSON.stringify(event.data)
        return (
          <Box key={event.id} borderStyle={isSelected ? "single" : undefined}>
            <Text dimColor>{new Date(event.timestamp).toLocaleTimeString()}</Text>
            <Text color={LEVEL_COLORS[level]}> {level.toUpperCase()}</Text>
            <Text> {event.type}</Text>
            <Text dimColor> {message}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
```

- [ ] **Step 3: Update `app.tsx` to wire daemon subscription, `d` key, and pass correct events to `LogsTab`**

Replace `packages/tui/src/app.tsx` with:

```tsx
import { useEffect, useReducer } from "react"
import { Box, useInput, useApp } from "ink"
import { createClient, type EventType, DAEMON_SESSION_ID } from "@adlr/sdk"
import { initialState, reducer } from "./types"
import { Header } from "./components/Header"
import { Footer } from "./components/Footer"
import { HotkeyDialog } from "./components/HotkeyDialog"
import { OverviewTab } from "./components/OverviewTab"
import { ContextTab } from "./components/ContextTab"
import { AgentsTab } from "./components/AgentsTab"
import { TracesTab } from "./components/TracesTab"
import { LogsTab } from "./components/LogsTab"

export function App({ sessionId }: { sessionId: string }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { exit } = useApp()

  // Subscribe to session events
  useEffect(() => {
    const client = createClient()
    let cleanup: (() => void) | undefined

    ;(async () => {
      try {
        const unsub = await client.subscribe(sessionId, (msg) => {
          if (msg.type === "snapshot") {
            dispatch({ type: "snapshot", payload: msg.payload })
          } else if (msg.type === "event") {
            dispatch({
              type: "event",
              payload: {
                id: Date.now(),
                session_id: sessionId,
                span_id: (msg.payload as any)?.span_id ?? null,
                type: msg.event as EventType,
                data: msg.payload as any,
                timestamp: Date.now(),
              },
            })
          }
        })
        cleanup = unsub
      } catch (err) {
        dispatch({
          type: "event",
          payload: {
            id: Date.now(),
            session_id: sessionId,
            span_id: null,
            type: "log.error",
            data: { message: String(err) },
            timestamp: Date.now(),
          },
        })
      }
    })()

    return () => {
      cleanup?.()
      client.close()
    }
  }, [sessionId])

  // Subscribe to daemon events
  useEffect(() => {
    const client = createClient()
    let cleanup: (() => void) | undefined

    ;(async () => {
      try {
        const unsub = await client.subscribe(DAEMON_SESSION_ID, (msg) => {
          if (msg.type === "snapshot") {
            const snapshot = msg.payload as { session: any; spans: any[]; events: any[]; context: any[] }
            dispatch({ type: "daemonSnapshot", payload: snapshot.events ?? [] })
          } else if (msg.type === "event") {
            dispatch({
              type: "daemonEvent",
              payload: {
                id: Date.now(),
                session_id: DAEMON_SESSION_ID,
                span_id: null,
                type: msg.event as EventType,
                data: msg.payload as any,
                timestamp: Date.now(),
              },
            })
          }
        })
        cleanup = unsub
      } catch {
        // Daemon events are best-effort; silently ignore connection errors
      }
    })()

    return () => {
      cleanup?.()
      client.close()
    }
  }, [])

  useInput((input, key) => {
    if (state.isHelpOpen) {
      if (input === "?" || key.escape) {
        dispatch({ type: "toggleHelp" })
      }
      return
    }

    if (input === "?") {
      dispatch({ type: "toggleHelp" })
      return
    }

    if (key.tab) {
      if (key.shift) {
        dispatch({ type: "prevTab" })
      } else {
        dispatch({ type: "nextTab" })
      }
      return
    }

    if (input === "q" || (key.ctrl && input === "c")) {
      exit()
      return
    }

    if (input >= "1" && input <= "5") {
      dispatch({ type: "setTab", tab: parseInt(input) - 1 })
      return
    }

    if (state.activeTab === 2) {
      // Agents tab
      const agents = state.spans.filter(s => s.kind === "agent")
      if (key.upArrow) {
        dispatch({ type: "selectAgent", index: Math.max(0, state.agentsSelectedIndex - 1) })
      } else if (key.downArrow) {
        dispatch({ type: "selectAgent", index: Math.min(agents.length - 1, state.agentsSelectedIndex + 1) })
      } else if (key.return) {
        const agent = agents[state.agentsSelectedIndex]
        if (agent) {
          // TODO: attach or read output
        }
      }
    } else if (state.activeTab === 3) {
      // Traces tab
      if (key.upArrow) {
        dispatch({ type: "selectTrace", index: Math.max(0, state.tracesSelectedIndex - 1) })
      } else if (key.downArrow) {
        dispatch({ type: "selectTrace", index: Math.min(state.spans.length - 1, state.tracesSelectedIndex + 1) })
      }
    } else if (state.activeTab === 4) {
      // Logs tab
      if (input === "d") {
        dispatch({ type: "toggleLogsView" })
      } else if (input === "i") {
        dispatch({ type: "setLogsFilter", filter: "info" })
      } else if (input === "w") {
        dispatch({ type: "setLogsFilter", filter: "warn" })
      } else if (input === "e") {
        dispatch({ type: "setLogsFilter", filter: "error" })
      } else if (input === "f") {
        dispatch({ type: "toggleLogsAutoScroll" })
      } else if (key.upArrow) {
        dispatch({ type: "selectLog", index: Math.max(0, state.logsSelectedIndex - 1) })
      } else if (key.downArrow) {
        dispatch({ type: "selectLog", index: Math.min(state.events.length - 1, state.logsSelectedIndex + 1) })
      }
    }
  })

  const logsEvents = state.logsView === "daemon" ? state.daemonEvents : state.events

  return (
    <Box flexDirection="column" height="100%">
      <Header session={state.session} activeTab={state.activeTab} />
      <Box flexGrow={1}>
        {state.activeTab === 0 && (
          <OverviewTab session={state.session} spans={state.spans} context={state.context} />
        )}
        {state.activeTab === 1 && (
          <ContextTab context={state.context} selectedIndex={0} />
        )}
        {state.activeTab === 2 && (
          <AgentsTab spans={state.spans} selectedIndex={state.agentsSelectedIndex} />
        )}
        {state.activeTab === 3 && (
          <TracesTab spans={state.spans} selectedIndex={state.tracesSelectedIndex} />
        )}
        {state.activeTab === 4 && (
          <LogsTab
            events={logsEvents}
            selectedIndex={state.logsSelectedIndex}
            filter={state.logsFilter}
            logsView={state.logsView}
          />
        )}
      </Box>
      {state.isHelpOpen && <HotkeyDialog />}
      <Footer activeTab={state.activeTab} />
    </Box>
  )
}
```

- [ ] **Step 4: Run all TUI tests**

```bash
cd packages/tui && bun test
```

Expected: PASS

- [ ] **Step 5: Run all daemon tests**

```bash
cd packages/daemon && bun test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/types.ts packages/tui/src/app.tsx packages/tui/src/components/LogsTab.tsx
git commit -m "feat(tui): add daemon logs view toggle with d key"
```

---

### Task 8: Filter `__daemon__` from session lists

**Files:**
- Modify: `packages/daemon/src/handlers.ts`

The only place `session.list` is exposed to clients is the `session.list` IPC command in `handlers.ts`. `OverviewTab` and other TUI components receive a single session via subscribe, not a list — so no TUI component changes are needed.

- [ ] **Step 1: Add the filter to `session.list` in `packages/daemon/src/handlers.ts`**

Add the import at the top of the file alongside the existing imports:
```ts
import { DAEMON_SESSION_ID } from "@adlr/sdk"
```

Then update the `session.list` case (line 26):
```ts
case "session.list": {
  const sessions = await ctx.storage.listSessions()
  return sessions.filter(s => s.id !== DAEMON_SESSION_ID)
}
```

- [ ] **Step 2: Run all tests**

```bash
cd packages/daemon && bun test && cd ../tui && bun test
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/handlers.ts
git commit -m "feat(daemon): exclude __daemon__ session from session.list results"
```

---

### Task 9: Final integration check

- [ ] **Step 1: Run all tests across all packages**

```bash
cd /Users/karl/git/adlr && bun test --recursive
```

Expected: all tests pass

- [ ] **Step 2: Type-check the packages**

```bash
cd packages/sdk && bunx tsc --noEmit 2>&1
cd packages/daemon && bunx tsc --noEmit 2>&1
cd packages/tui && bunx tsc --noEmit 2>&1
```

Expected: no type errors

- [ ] **Step 3: Commit if any final fixes were needed, then tag**

```bash
git add -A
git commit -m "chore: final type fixes for daemon structured logging" # only if needed
```
