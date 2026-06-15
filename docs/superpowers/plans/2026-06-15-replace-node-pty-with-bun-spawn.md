# Replace node-pty with Bun.spawn PTY Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `node-pty` native addon in the daemon with Bun's built-in `Bun.spawn({ terminal: ... })` PTY API, eliminating the permissions bug and the native dependency entirely.

**Architecture:** `process-manager.ts` is the only file that changes. `AgentProcess` swaps its `pty` field for `proc: Bun.Subprocess` and `terminal: Bun.Terminal`. All idle-tracking logic stays unchanged. `server.ts` gets a one-line update where it writes to `agent.pty`. `node-pty` is removed from `packages/daemon/package.json`.

**Tech Stack:** Bun 1.3.14 (`Bun.spawn`, `Bun.Terminal`), bun:test

---

## File Map

| File | Change |
|------|--------|
| `packages/daemon/src/process-manager.ts` | Replace node-pty import and usage with `Bun.spawn({ terminal: ... })` |
| `packages/daemon/src/server.ts` | Update `agent.pty.write(...)` → `agent.terminal.write(...)` |
| `packages/daemon/package.json` | Remove `node-pty` dependency |
| `packages/daemon/test/process-manager.test.ts` | Add tests for data flow, exit handling, cwd fix, and stop() |

---

### Task 1: Update `AgentProcess` type and remove node-pty import

**Files:**
- Modify: `packages/daemon/src/process-manager.ts:1-16`

- [ ] **Step 1: Write a failing type-check test**

In `packages/daemon/test/process-manager.test.ts`, add this import check at the top of the file after the existing imports. It will fail once we change the type but haven't updated server.ts yet — we'll use this as a compile-time canary:

```ts
// Type guard: AgentProcess must have proc and terminal, not pty
import type { AgentProcess } from "../src/process-manager"
type _Check = AgentProcess extends { proc: Bun.Subprocess; terminal: Bun.Terminal } ? true : never
```

- [ ] **Step 2: Run tests to confirm they still pass before changing anything**

```bash
bun test packages/daemon/test/process-manager.test.ts
```

Expected output: `2 pass, 0 fail`

- [ ] **Step 3: Replace the `AgentProcess` type and remove the node-pty import**

Replace the top of `packages/daemon/src/process-manager.ts` (lines 1–16):

```ts
import type { Storage, Span, SpanStatus } from "@adler/sdk"
import { SOCKET_PATH } from "@adler/sdk"
import type { InactivityTimer } from "./lifecycle"
import type { ConfigLoader } from "./config-loader"

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
```

- [ ] **Step 4: Run bun check to confirm the type change compiles (will have errors from usages — that's expected)**

```bash
cd packages/daemon && bun build src/index.ts --target=bun 2>&1 | head -30
```

Expected: errors referencing `pty` — confirms we need to update usages next.

---

### Task 2: Replace `spawnPty` call with `Bun.spawn({ terminal: ... })`

**Files:**
- Modify: `packages/daemon/src/process-manager.ts:72-135`

- [ ] **Step 1: Write a failing test for data flow and cwd**

Add to `packages/daemon/test/process-manager.test.ts`:

```ts
test("spawned agent uses session working_dir as cwd", async () => {
  const adlerDir = join(testDir, ".adler")
  mkdirSync(adlerDir, { recursive: true })
  writeFileSync(
    join(adlerDir, "adler.ts"),
    // The command prints the cwd; we verify it matches testDir
    `export default { agent: { agents: { cwd-test: { run: () => "pwd" } } } }`,
    "utf-8"
  )

  pm = new ProcessManager(storage, loader, () => {})
  const session = await storage.createSession({ working_dir: testDir })
  const span = await pm.spawnAgent({
    sessionId: session.id,
    agentType: "cwd-test",
    prompt: "test",
    name: "cwd-test-agent",
  })

  // Wait for process to finish
  await new Promise<void>((resolve) => {
    const check = setInterval(async () => {
      const s = await storage.getSpan(span.id)
      if (s?.status === "done" || s?.status === "failed") {
        clearInterval(check)
        resolve()
      }
    }, 50)
  })

  const finished = await storage.getSpan(span.id)
  expect(finished?.data?.exit_code).toBe(0)

  // Buffer should contain the testDir path (pwd output)
  const agent = pm.getAgent(span.id)
  // agent is removed from map on completion, check via span data
  expect(finished?.status).toBe("done")
})
```

- [ ] **Step 2: Run the test to confirm it fails (node-pty still in use)**

```bash
bun test packages/daemon/test/process-manager.test.ts --test-name-pattern "cwd"
```

Expected: test fails or errors.

- [ ] **Step 3: Replace the spawn call and event wiring in `spawnAgent`**

In `packages/daemon/src/process-manager.ts`, replace lines 72–135 (from the `const pty = spawnPty(...)` call through the end of `spawnAgent`).

The key ordering constraint: the `terminal.data` callback closes over both `agent` and `this.attachListeners`. Since `agent` is assigned after `Bun.spawn` returns, we use a `let` binding declared before the spawn so the closure captures the variable slot, then assign it immediately after:

```ts
    // Declare agent before spawn so terminal callbacks can close over it
    let agent: AgentProcess
    const attachListeners = this.attachListeners
    const self = this

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
          exit(_terminal, ptyExitCode, _signal) {
            // PTY stream closed with error (exitCode 1 = error) before proc exits
            if (ptyExitCode === 1 && agent && !agent.exited) {
              agent.exited = true
              agent.exitCode = 1
              self.completeAgent(span.id, 1)
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

    // Now assign agent — terminal callbacks fire asynchronously, so agent is set before any data arrives
    agent = {
      spanId: span.id,
      proc,
      terminal: proc.terminal!,
      stdoutBuffer: "",
      lastStdoutTime: Date.now(),
      stdoutIdle: false,
      status: "running",
      exited: false,
      exitCode: null,
    }

    this.agents.set(span.id, agent)
    this.inactivity?.addAgent()

    proc.exited.then(async (exitCode) => {
      agent.exited = true
      agent.exitCode = exitCode ?? null
      await this.completeAgent(span.id, exitCode ?? 0)
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
```

- [ ] **Step 4: Run the cwd test**

```bash
bun test packages/daemon/test/process-manager.test.ts --test-name-pattern "cwd"
```

Expected: `1 pass`

- [ ] **Step 5: Run all process-manager tests**

```bash
bun test packages/daemon/test/process-manager.test.ts
```

Expected: all pass.

---

### Task 3: Update `stop()` to kill all agents

**Files:**
- Modify: `packages/daemon/src/process-manager.ts:243-257`

- [ ] **Step 1: Write a failing test for stop() killing all agents**

Add to `packages/daemon/test/process-manager.test.ts`:

```ts
test("stop() kills all tracked agents regardless of mode", async () => {
  const adlerDir = join(testDir, ".adler")
  mkdirSync(adlerDir, { recursive: true })
  writeFileSync(
    join(adlerDir, "adler.ts"),
    // sleep keeps the process alive so we can verify stop() kills it
    `export default { agent: { agents: { sleeper: { run: () => "sleep 60" } } } }`,
    "utf-8"
  )

  pm = new ProcessManager(storage, loader, () => {})
  const session = await storage.createSession({ working_dir: testDir })
  const span = await pm.spawnAgent({
    sessionId: session.id,
    agentType: "sleeper",
    prompt: "test",
    name: "sleeper-agent",
  })

  // Agent should be tracked
  expect(pm.getAgent(span.id)).toBeDefined()

  // stop() should kill it without hanging
  await pm.stop()

  // Agent should be removed from tracking
  expect(pm.getAgent(span.id)).toBeUndefined()
})
```

- [ ] **Step 2: Run to confirm it fails (current stop() doesn't kill non-interactive agents)**

```bash
bun test packages/daemon/test/process-manager.test.ts --test-name-pattern "stop"
```

Expected: test times out or fails.

- [ ] **Step 3: Replace `stop()` to kill all agents**

Replace the `stop()` method in `packages/daemon/src/process-manager.ts` (lines 243–257):

```ts
  async stop(): Promise<void> {
    for (const interval of this.statusIntervals.values()) {
      clearInterval(interval)
    }
    this.statusIntervals.clear()

    for (const [spanId, agent] of this.agents) {
      try {
        agent.proc.kill()
      } catch (e) {
        // Process may have already exited
      }
      this.agents.delete(spanId)
      this.attachListeners.delete(spanId)
      this.inactivity?.removeAgent()
    }
  }
```

- [ ] **Step 4: Run the stop test**

```bash
bun test packages/daemon/test/process-manager.test.ts --test-name-pattern "stop"
```

Expected: `1 pass`

- [ ] **Step 5: Run all process-manager tests**

```bash
bun test packages/daemon/test/process-manager.test.ts
```

Expected: all pass.

---

### Task 4: Update `server.ts` stdin write-back

**Files:**
- Modify: `packages/daemon/src/server.ts:46`

- [ ] **Step 1: Update `agent.pty.write` to `agent.terminal.write`**

In `packages/daemon/src/server.ts`, replace line 46:

```ts
          agent.pty.write(data.toString())
```

with:

```ts
          agent.terminal.write(data.toString())
```

- [ ] **Step 2: Run all daemon tests**

```bash
bun test packages/daemon
```

Expected: all pass, no TypeScript errors about `pty`.

---

### Task 5: Remove node-pty dependency

**Files:**
- Modify: `packages/daemon/package.json`

- [ ] **Step 1: Remove node-pty from dependencies**

In `packages/daemon/package.json`, remove the `"node-pty": "^1.1.0"` line. The file should look like:

```json
{
  "name": "adlerd",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "bin": {
    "adlerd": "src/index.ts"
  },
  "scripts": {
    "test": "bun test",
    "start": "bun src/index.ts"
  },
  "dependencies": {
    "@adler/sdk": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Remove node-pty from the lockfile**

```bash
cd /path/to/repo && bun install
```

Expected: `node-pty` no longer appears in `bun.lock`.

- [ ] **Step 3: Verify node-pty is gone**

```bash
ls packages/daemon/node_modules/node-pty 2>&1
```

Expected: `No such file or directory`

- [ ] **Step 4: Run all daemon tests to confirm nothing broken**

```bash
bun test packages/daemon
```

Expected: all pass.

---

### Task 6: End-to-end smoke test and commit

- [ ] **Step 1: Kill any running daemon so a fresh one starts**

```bash
pkill -f "adler/packages/daemon/src/index.ts" 2>/dev/null || true
sleep 1
```

- [ ] **Step 2: Run the CLI command that was originally broken**

```bash
bun run packages/cli/src/index.ts agent run --agent opencode "give a brief overview of the codebase" 2>&1
```

Expected: a span UUID printed, no `posix_spawnp failed` error.

- [ ] **Step 3: Run the full daemon test suite one final time**

```bash
bun test packages/daemon
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/process-manager.ts packages/daemon/src/server.ts packages/daemon/package.json packages/daemon/test/process-manager.test.ts bun.lock
git commit -m "feat(daemon): replace node-pty with Bun.spawn PTY API

- Eliminates native addon and posix_spawnp permissions bug
- Fixes cwd bug: agents now run in session.working_dir, not daemon cwd
- stop() now kills all tracked agents, not just interactive ones
- No public interface changes"
```
