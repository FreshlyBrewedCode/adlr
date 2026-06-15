# Daemon Config — Dynamic Per-Directory Loading with Hot Reload

## Date
2026-06-15

## Status
Approved

## Context

The adler daemon (`packages/daemon`) currently loads configuration once at startup using `config-loader.ts`. It resolves two files:

1. Global config: `~/.config/adler/adler.ts`
2. Project config: `join(process.cwd(), ".adler/adler.ts")`

The merged config is passed into `ProcessManager` and used for the daemon's entire lifetime. This creates two problems:

1. **No hot reload** — Changing a config file while the daemon is running has no effect. Users must restart the daemon to pick up changes.
2. **Single config across projects** — The daemon is a singleton (one socket/PID in `~/.local/share/adler/`). When a user runs `adler` from a different project directory, the daemon still uses the config from its startup directory, not the current project's config.

## Goals

1. **Per-directory config resolution** — When spawning an agent, the daemon should use the config associated with the session's `working_dir`, not the daemon's startup `cwd`.
2. **Hot reload** — Config changes should be picked up automatically without restarting the daemon.
3. **Backward compatibility** — No CLI changes required; existing commands continue to work.
4. **Minimal resource overhead** — Only watch config files that have been accessed; avoid unnecessary watchers.

## Non-Goals

- Changing the daemon's singleton architecture (one global daemon).
- Adding a config validation/schema layer beyond the existing TypeScript types.
- Optimizing to avoid watching the global config file independently for each project directory. We watch both files per directory for simplicity.
- CLI changes to pass directory context explicitly (the daemon already receives `working_dir` via `session.create`).

## Architecture

### New `ConfigLoader` Class

Replaces the `loadConfig()` function in `config-loader.ts`.

```ts
class ConfigLoader {
  private cache = new Map<string, CachedConfig>()
  private watchers = new Map<string, FSWatcher>()

  loadConfig(dir: string): AdlerConfig
  invalidate(dir: string): void
  close(): void
}
```

**Cache entry:** `{ config: AdlerConfig }` keyed by absolute directory path.

**Behavior:**
- `loadConfig(dir)` resolves the global config + the project config at `join(dir, ".adler/adler.ts")`, merges them, caches the result, and starts `fs.watch` on both files.
- `fs.watch` callback invalidates the cache entry for that directory when either config file changes.
- `close()` clears all watchers and the cache (used during shutdown).
- If a config file is deleted, the watcher fires; we invalidate the cache and subsequent calls fall back to the remaining config source.
- If a config file is malformed, `loadConfig` logs the error and returns `{}` for that source, preserving the other.

### Modified `ProcessManager`

- Removes the `config` field from the constructor.
- Receives a `configLoader` instance instead.
- `spawnAgent()` and `pollStatus()` call `configLoader.loadConfig(session.working_dir)` on demand.
- The config is fetched fresh for each spawn, so hot reload is automatic.

### Modified `index.ts` (daemon entry point)

- Instantiates `ConfigLoader`.
- Passes it to `ProcessManager`.
- Calls `configLoader.close()` during shutdown.

### Data Flow

1. User runs `adler agent run --agent foo` from `/project-b`.
2. CLI sends `agent.run` with `session_id`.
3. `ProcessManager.spawnAgent()` fetches the session from storage to get `working_dir`.
4. `configLoader.loadConfig("/project-b")` checks cache:
   - **Miss**: loads `~/.config/adler/adler.ts` + `/project-b/.adler/adler.ts`, merges, caches, starts watching.
   - **Hit**: returns cached config.
5. Agent spawned with `/project-b` config.
6. User edits `/project-b/.adler/adler.ts`.
7. `fs.watch` fires, `ConfigLoader` invalidates the `/project-b` cache entry.
8. Next `agent.run` from `/project-b` re-reads and caches the new config.

## File Structure

```
packages/daemon/src/
  config-loader.ts   # ConfigLoader class replaces loadConfig function
  process-manager.ts # Receives configLoader, calls loadConfig per session
  index.ts           # Instantiates ConfigLoader, passes to ProcessManager
  handlers.ts        # No changes
  server.ts          # No changes
  lifecycle.ts       # No changes
```

No changes to `packages/cli` or `packages/sdk`.

## Testing

- Unit test: `ConfigLoader` loads and merges configs correctly.
- Unit test: `ConfigLoader` cache hit/miss behavior.
- Unit test: `ConfigLoader` watcher invalidates cache on file change.
- Unit test: `ProcessManager` calls `configLoader.loadConfig` with the correct directory.
- Integration test: spawn agent from project A, change config, spawn agent from project A again, verify new config is used.
- Integration test: spawn agent from project A, then spawn agent from project B, verify different configs are used.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Race condition: config changes during agent spawn | `loadConfig` is called synchronously before `spawnPty`; the running agent keeps the config it was spawned with. |
| File watcher leaks | `invalidate()` and `close()` close all watchers. `stop()` in `ProcessManager` is called during shutdown. |
| Many open watchers if user works across many projects | Only directories that have spawned agents get watchers. `close()` cleans them all on shutdown. |
| `fs.watch` reliability across platforms | Use `fs.watch` (Node.js built-in) which is the standard approach; if issues arise, we can switch to `fs.watchFile` as a fallback. |

## Dependencies

None — uses Node.js built-in `fs.watch`.
