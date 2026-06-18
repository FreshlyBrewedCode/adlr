# Daemon Config Hot Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the daemon's config loading to support per-directory config resolution with hot reload via file watching.

**Architecture:** Replace the `loadConfig()` function with a `ConfigLoader` class that caches configs per directory and watches the files. Update `ProcessManager` to request config on-demand from `ConfigLoader` using the session's `working_dir`.

**Tech Stack:** TypeScript, Node.js `fs.watch`, Bun test runner

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `packages/daemon/src/config-loader.ts` | `ConfigLoader` class with caching, watching, and invalidation | Modify |
| `packages/daemon/src/process-manager.ts` | Use `ConfigLoader` instead of cached `AdlrConfig` | Modify |
| `packages/daemon/src/index.ts` | Instantiate `ConfigLoader`, pass to `ProcessManager`, close on shutdown | Modify |
| `packages/daemon/test/config-loader.test.ts` | Unit tests for `ConfigLoader` | Create |
| `packages/daemon/test/process-manager.test.ts` | Unit tests for `ProcessManager` config loading | Create |

---

## Task 1: Refactor `config-loader.ts` into `ConfigLoader` class

**Files:**
- Modify: `packages/daemon/src/config-loader.ts`

- [ ] **Step 1: Write the new `ConfigLoader` class**

Replace the entire file with:

```typescript
import { existsSync, watch, type FSWatcher } from "fs"
import { join } from "path"
import { homedir } from "os"
import type { AdlrConfig } from "@adlr/sdk"

const GLOBAL_CONFIG = join(homedir(), ".config/adlr/adlr.ts")

export class ConfigLoader {
  private cache = new Map<string, AdlrConfig>()
  private watchers = new Map<string, FSWatcher>()

  async loadConfig(dir: string): Promise<AdlrConfig> {
    const absDir = join(dir) // normalize
    const cached = this.cache.get(absDir)
    if (cached) {
      return cached
    }

    const config = await this.resolveConfig(absDir)
    this.cache.set(absDir, config)
    this.watchConfig(absDir)
    return config
  }

  private async resolveConfig(dir: string): Promise<AdlrConfig> {
    let globalConfig: AdlrConfig = {}
    let projectConfig: AdlrConfig = {}

    if (existsSync(GLOBAL_CONFIG)) {
      try {
        const mod = await import(GLOBAL_CONFIG)
        globalConfig = mod.default ?? {}
      } catch (e) {
        console.error(`Failed to load global config ${GLOBAL_CONFIG}:`, e instanceof Error ? e.message : String(e))
      }
    }

    const projectConfigPath = join(dir, ".adlr/adlr.ts")
    if (existsSync(projectConfigPath)) {
      try {
        const mod = await import(projectConfigPath)
        projectConfig = mod.default ?? {}
      } catch (e) {
        console.error(`Failed to load project config ${projectConfigPath}:`, e instanceof Error ? e.message : String(e))
      }
    }

    return mergeConfig(globalConfig, projectConfig)
  }

  private watchConfig(dir: string): void {
    if (this.watchers.has(dir)) return

    const files = [GLOBAL_CONFIG, join(dir, ".adlr/adlr.ts")].filter(existsSync)
    if (files.length === 0) return

    const watcher = watch(files, (eventType, filename) => {
      this.invalidate(dir)
    })

    this.watchers.set(dir, watcher)
  }

  invalidate(dir: string): void {
    const absDir = join(dir)
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
  return {
    ...base,
    ...override,
    agent: {
      ...base.agent,
      ...override.agent,
      agents: { ...base.agent?.agents, ...override.agent?.agents },
      attach: override.agent?.attach ?? base.agent?.attach,
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/config-loader.ts
git commit -m "feat(daemon): add ConfigLoader class with caching and file watching"
```

---

## Task 2: Update `process-manager.ts` to use `ConfigLoader`

**Files:**
- Modify: `packages/daemon/src/process-manager.ts`

- [ ] **Step 1: Update imports and constructor**

Change the imports at the top:

```typescript
import { spawn as spawnPty } from "node-pty"
import type { Storage, Span, SpanStatus, AdlrConfig } from "@adlr/sdk"
import { SOCKET_PATH } from "@adlr/sdk"
import type { InactivityTimer } from "./lifecycle"
import type { ConfigLoader } from "./config-loader"
```

Change the constructor signature:

```typescript
export class ProcessManager {
  private agents = new Map<string, AgentProcess>()
  private attachListeners = new Map<string, Set<(data: Buffer) => void>>()
  private statusIntervals = new Map<string, ReturnType<typeof setInterval>>()

  constructor(
    private storage: Storage,
    private configLoader: ConfigLoader,
    private onEvent: (event: { type: string; payload: unknown }) => void,
    private inactivity?: InactivityTimer,
  ) {}
```

- [ ] **Step 2: Update `spawnAgent` to load config on demand**

In `spawnAgent`, after creating the span, add a call to load the config:

```typescript
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
    // ... rest of the method remains unchanged
```

- [ ] **Step 3: Update `pollStatus` to load config on demand**

In `pollStatus`, load the config from the span's session:

```typescript
  private async pollStatus(spanId: string, statusHook: NonNullable<AdlrConfig["agent"]["agents"][string]["status"]>) {
    const agent = this.agents.get(spanId)
    if (!agent || agent.exited) return

    const span = await this.storage.getSpan(spanId)
    if (!span) return

    const session = await this.storage.getSession(span.session_id)
    if (!session) return

    const config = await this.configLoader.loadConfig(session.working_dir)
    const agentDef = config.agent?.agents?.[span.data.agent_type as string]
    const timeout = agentDef?.interactiveTimeout ?? 3000
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
```

- [ ] **Step 4: Update `completeAgent` to load config on demand**

In `completeAgent`, load the config from the span's session:

```typescript
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
        console.error("Agent output hook failed:", e instanceof Error ? e.message : String(e))
      }
    }
    // ... rest of the method remains unchanged
```

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/process-manager.ts
git commit -m "feat(daemon): use ConfigLoader for per-directory config resolution"
```

---

## Task 3: Update `index.ts` to instantiate and pass `ConfigLoader`

**Files:**
- Modify: `packages/daemon/src/index.ts`

- [ ] **Step 1: Update imports**

```typescript
import { SQLiteStorage, DB_PATH } from "@adlr/sdk"
import { startServer } from "./server"
import { ProcessManager } from "./process-manager"
import { ConfigLoader } from "./config-loader"
import { writePid, removePid, removeSocket, isDaemonRunning, InactivityTimer } from "./lifecycle"
```

- [ ] **Step 2: Update `main` function**

```typescript
async function main() {
  if (isDaemonRunning()) {
    console.error("Daemon is already running")
    process.exit(1)
  }

  const storage = new SQLiteStorage(DB_PATH)
  const configLoader = new ConfigLoader()

  const inactivity = new InactivityTimer(() => {
    console.log("Shutting down due to inactivity")
    shutdown()
  })

  let processManager: ProcessManager

  const server = startServer(storage, () => processManager, inactivity)

  processManager = new ProcessManager(storage, configLoader, (event) => {
    const payload = event.payload as Record<string, unknown> | undefined
    const sessionId = payload?.session_id as string | undefined
    if (sessionId) {
      server.broadcast(sessionId, event)
    }
  }, inactivity)

  writePid()

  function shutdown() {
    server.close()
    processManager.stop()
    inactivity.stop()
    configLoader.close()
    storage.close()
    removePid()
    removeSocket()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  console.log("adlrd started")
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/index.ts
git commit -m "feat(daemon): instantiate ConfigLoader and close on shutdown"
```

---

## Task 4: Write tests for `ConfigLoader`

**Files:**
- Create: `packages/daemon/test/config-loader.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { ConfigLoader } from "../src/config-loader"
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

function createTestDir(): string {
  const dir = join(tmpdir(), `adlr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe("ConfigLoader", () => {
  let loader: ConfigLoader
  let testDir: string

  beforeEach(() => {
    loader = new ConfigLoader()
    testDir = createTestDir()
  })

  afterEach(() => {
    loader.close()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("returns empty config when no config files exist", async () => {
    const config = await loader.loadConfig(testDir)
    expect(config).toEqual({})
  })

  test("loads project config", async () => {
    const adlrDir = join(testDir, ".adlr")
    mkdirSync(adlrDir, { recursive: true })
    writeFileSync(
      join(adlrDir, "adlr.ts"),
      `export default { agent: { agents: { test: { interactive: true } } } }`,
      "utf-8"
    )

    const config = await loader.loadConfig(testDir)
    expect(config.agent?.agents?.test).toEqual({ interactive: true })
  })

  test("caches config on second load", async () => {
    const adlrDir = join(testDir, ".adlr")
    mkdirSync(adlrDir, { recursive: true })
    writeFileSync(
      join(adlrDir, "adlr.ts"),
      `export default { agent: { agents: { test: { interactive: true } } } }`,
      "utf-8"
    )

    const config1 = await loader.loadConfig(testDir)
    const config2 = await loader.loadConfig(testDir)
    expect(config1).toBe(config2)
  })

  test("invalidates cache and reloads on file change", async () => {
    const adlrDir = join(testDir, ".adlr")
    mkdirSync(adlrDir, { recursive: true })
    writeFileSync(
      join(adlrDir, "adlr.ts"),
      `export default { agent: { agents: { test: { interactive: true } } } }`,
      "utf-8"
    )

    const config1 = await loader.loadConfig(testDir)
    expect(config1.agent?.agents?.test).toEqual({ interactive: true })

    // Manually invalidate to simulate file change
    loader.invalidate(testDir)

    writeFileSync(
      join(adlrDir, "adlr.ts"),
      `export default { agent: { agents: { test: { interactive: false } } } }`,
      "utf-8"
    )

    const config2 = await loader.loadConfig(testDir)
    expect(config2.agent?.agents?.test).toEqual({ interactive: false })
  })

  test("close clears all watchers and cache", async () => {
    const adlrDir = join(testDir, ".adlr")
    mkdirSync(adlrDir, { recursive: true })
    writeFileSync(
      join(adlrDir, "adlr.ts"),
      `export default { agent: { agents: { test: { interactive: true } } } }`,
      "utf-8"
    )

    await loader.loadConfig(testDir)
    loader.close()

    // After close, should reload from disk
    const config = await loader.loadConfig(testDir)
    expect(config.agent?.agents?.test).toEqual({ interactive: true })
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/daemon && bun test test/config-loader.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/test/config-loader.test.ts
git commit -m "test(daemon): add ConfigLoader tests"
```

---

## Task 5: Write tests for `ProcessManager` config loading

**Files:**
- Create: `packages/daemon/test/process-manager.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { SQLiteStorage } from "@adlr/sdk"
import { ProcessManager } from "../src/process-manager"
import { ConfigLoader } from "../src/config-loader"
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

function createTestDir(): string {
  const dir = join(tmpdir(), `adlr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe("ProcessManager", () => {
  let storage: SQLiteStorage
  let loader: ConfigLoader
  let testDir: string

  beforeEach(() => {
    storage = new SQLiteStorage(":memory:")
    loader = new ConfigLoader()
    testDir = createTestDir()
  })

  afterEach(() => {
    loader.close()
    storage.close()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("uses ConfigLoader with session working_dir", async () => {
    const adlrDir = join(testDir, ".adlr")
    mkdirSync(adlrDir, { recursive: true })
    writeFileSync(
      join(adlrDir, "adlr.ts"),
      `export default { agent: { agents: { test: { run: () => "echo hello" } } } }`,
      "utf-8"
    )

    const pm = new ProcessManager(storage, loader, () => {})
    const session = await storage.createSession({ working_dir: testDir })

    try {
      await pm.spawnAgent({
        sessionId: session.id,
        agentType: "test",
        prompt: "hello",
        name: "test-agent",
      })
    } catch (e) {
      // Agent may fail to run because "sh -c echo hello" isn't a real agent,
      // but it should NOT fail with "Unknown agent type"
      expect((e as Error).message).not.toContain("Unknown agent type")
    }
  })

  test("rejects unknown agent type from session directory", async () => {
    const pm = new ProcessManager(storage, loader, () => {})
    const session = await storage.createSession({ working_dir: testDir })

    expect(
      pm.spawnAgent({
        sessionId: session.id,
        agentType: "nonexistent",
        prompt: "hello",
        name: "test-agent",
      })
    ).rejects.toThrow("Unknown agent type: nonexistent")
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd packages/daemon && bun test test/process-manager.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/test/process-manager.test.ts
git commit -m "test(daemon): add ProcessManager config loading tests"
```

---

## Task 6: Run full test suite

- [ ] **Step 1: Run all daemon tests**

```bash
cd packages/daemon && bun test
```

Expected: All tests pass.

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "chore(daemon): verify all tests pass"
```

---

## Self-Review

**Spec coverage:**
- ✅ `ConfigLoader` class with caching, watching, and invalidation — Task 1
- ✅ `ProcessManager` uses `ConfigLoader` with `session.working_dir` — Task 2
- ✅ `index.ts` instantiates `ConfigLoader` and closes on shutdown — Task 3
- ✅ Unit tests for `ConfigLoader` — Task 4
- ✅ Unit tests for `ProcessManager` config loading — Task 5

**Placeholder scan:** None found. All steps include complete code.

**Type consistency:**
- `ConfigLoader` class name used consistently across all tasks.
- `loadConfig(dir: string)` signature used consistently.
- `ProcessManager` constructor updated to accept `ConfigLoader` in all tasks.

---

## Plan complete

**Plan saved to:** `docs/superpowers/plans/2026-06-15-daemon-config-hot-reload.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
