# Design: Replace node-pty with Bun.spawn PTY

**Date:** 2026-06-15
**Status:** Approved

## Background

The daemon uses `node-pty` to spawn agent processes in a pseudoterminal. `node-pty` is a native C addon that ships prebuilt binaries. When installed via `bun install`, the `spawn-helper` binary is installed without execute permissions (`-rw-r--r--` instead of `-rwxr-xr-x`), because bun skips `install`/`postinstall` scripts by default. This causes `posix_spawnp failed` at runtime.

Bun 1.3.14 includes a native PTY API (`Bun.spawn({ terminal: ... })`) that covers all current node-pty usage. Replacing node-pty eliminates the native addon, the permissions problem, and the external dependency entirely.

## Scope

One file changes: `packages/daemon/src/process-manager.ts`.
One dependency is removed: `node-pty` from `packages/daemon/package.json`.
No public interfaces change.

## Architecture

`ProcessManager` is the only consumer of node-pty in the codebase. Its public API (span IDs, attach listener callbacks, `spawnAgent`, `stop`) is unchanged. Callers never interact with pty objects directly.

## Spawn & Data Flow

The single `spawnPty("sh", ["-c", runCmd], { env, cwd })` call becomes:

```ts
const proc = Bun.spawn(["sh", "-c", runCmd], {
  env,
  cwd: session.working_dir,  // fix: was process.cwd() (daemon dir), now correctly uses session dir
  terminal: {
    cols: 80,
    rows: 24,
    data(terminal, data) {
      // replaces pty.onData — data is Uint8Array
      const str = Buffer.from(data).toString()
      // append to stdoutBuffer, fan out to attach listeners
    },
    exit(terminal, exitCode, signal) {
      // PTY stream closed — exitCode 1 = error
      // call completeAgent() if PTY errors before process exits
    },
  },
})
```

- `data` callback receives `Uint8Array`; converted to string via `Buffer.from(data).toString()` before appending to `stdoutBuffer` and fanning out to attach listeners — matching current behavior exactly.
- `proc.exited` (Promise) replaces `pty.onExit` — `.then()` calls `completeAgent()` on process exit. `proc.exited` is the authoritative source for process exit code.
- Stdin write-back in raw attach mode: `agent.pty.write(data.toString())` → `proc.terminal.write(data.toString())`
- Kill: `agent.pty.kill()` → `proc.kill()`

This also fixes an existing bug: `cwd` was previously `process.cwd()` (the daemon's working directory). It will now correctly use `session.working_dir`.

## AgentProcess Type

Changes from:

```ts
pty: ReturnType<typeof spawnPty>
```

to:

```ts
proc: Bun.Subprocess
terminal: Bun.Terminal
```

All idle-tracking fields are unchanged: `stdoutBuffer`, `lastStdoutTime`, `stdoutIdle`, `exited`, `exitCode`, `status`. These already serve the TUI agent idle-tracking purpose (knowing when to reuse or kill a process later).

## TUI Agent Lifecycle

TUI agents (`interactive: true`) are marked "done" by adlr when stdout has been idle beyond `interactiveTimeout`, but the underlying process keeps running and remains tracked in the `agents` map. `lastStdoutTime` and `stdoutIdle` capture idle state so the process can be reused or killed later. No new fields are needed.

## Error Handling

- `Bun.spawn` is wrapped in a try/catch. On immediate spawn failure, the span is marked `failed` and the error is rethrown.
- The `terminal.exit` callback handles PTY-level failures: `exitCode === 1` means PTY error. `completeAgent()` is called with a non-zero exit code in this case.
- `proc.exited` remains the authoritative source for normal process exit codes.

## Shutdown

`stop()` currently only kills agents that have a `statusIntervals` entry, leaving `log` mode agents unkilled on daemon shutdown. With the new design, `stop()` calls `proc.kill()` on **all** tracked agents regardless of mode.

## Dependency Change

Remove from `packages/daemon/package.json`:

```json
"node-pty": "^1.1.0"
```

The `import { spawn as spawnPty } from "node-pty"` import in `process-manager.ts` is removed. No other files reference node-pty.
