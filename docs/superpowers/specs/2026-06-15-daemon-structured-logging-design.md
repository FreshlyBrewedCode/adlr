# Daemon Structured Logging Design

**Date:** 2026-06-15
**Status:** Approved

## Overview

Wire the adlr daemon's operational logs into the existing structured event logging stack. Today the daemon uses bare `console.log`/`console.error` calls that are invisible in the TUI. This change makes daemon logs — and session-scoped agent lifecycle events — visible as structured `events` rows, queryable and renderable in the TUI `LogsTab`.

## Data Model

No schema changes to the `events` or `sessions` tables.

Daemon-level log events (those not associated with any real session) are stored using a reserved sentinel session ID `"__daemon__"`. This session row is created lazily in the `sessions` table the first time a daemon log is written — no eager insert at startup.

A new constant is exported from `packages/sdk/src`:

```ts
export const DAEMON_SESSION_ID = "__daemon__"
```

This lives in `packages/sdk/src/constants.ts` (new file) and is imported by both the daemon and the TUI to avoid magic strings.

No new `EventType` values are needed. `log.info`, `log.warn`, and `log.error` already cover the required level set.

## Logger Module

**File:** `packages/daemon/src/logger.ts`

```ts
export type LogContext = {
  session_id?: string  // defaults to "__daemon__" if omitted
  span_id?: string | null
}

export type DaemonLogger = {
  info(message: string, data?: Record<string, unknown>, ctx?: LogContext): Promise<void>
  warn(message: string, data?: Record<string, unknown>, ctx?: LogContext): Promise<void>
  error(message: string, data?: Record<string, unknown>, ctx?: LogContext): Promise<void>
}

export function createLogger(storage: Storage): DaemonLogger
```

### Behaviour

- Closes over `storage` and a `sentinelReady: boolean` flag (initially `false`).
- On first call to any method: upserts the `"__daemon__"` row into `sessions`, sets `sentinelReady = true`.
- Each method calls `storage.createEvent()` with:
  - `session_id`: `"__daemon__"` (for daemon-scoped events) or the real session ID (for session-scoped events — see call sites)
  - `span_id`: `null` (daemon-scoped) or the real span ID (session-scoped)
  - `type`: `"log.info"` | `"log.warn"` | `"log.error"`
  - `data`: `{ message, ...data }` where `data` is the optional extra fields passed by the caller
- Each method also calls `console.log` (info/warn) or `console.error` (error) as a side effect so daemon stdout remains useful for direct process inspection.

### Instantiation

The logger is created once in `packages/daemon/src/index.ts` immediately after storage is opened:

```ts
const logger = createLogger(storage)
```

It is then passed as an explicit argument to `DaemonServer`, `ProcessManager`, and `ConfigLoader`.

## Call Sites

### `index.ts` (daemon-scoped)

| Level | Message | Extra data |
|-------|---------|------------|
| `info` | `"adlrd started"` | — |
| `info` | `"Shutting down due to inactivity"` | — |
| `error` | `"Daemon startup failed"` | `{ error: string }` |

### `server.ts` (daemon-scoped)

| Level | Message | Extra data |
|-------|---------|------------|
| `error` | `"Failed to broadcast to client"` | `{ error: string }` |

### `config-loader.ts` (daemon-scoped)

| Level | Message | Extra data |
|-------|---------|------------|
| `info` | `"Config loaded"` | `{ global_path: string \| null, project_path: string \| null }` |
| `info` | `"Config reloaded"` | `{ path: string }` — one event per changed file |
| `warn` | `"Failed to load global config"` | `{ path: string, error: string }` |
| `warn` | `"Failed to load project config"` | `{ path: string, error: string }` |

### `process-manager.ts` (session-scoped — use actual `session_id` + `span_id`)

| Level | Message | Extra data |
|-------|---------|------------|
| `info` | `"Agent started"` | `{ agent: string, command: string, args: string[], cwd: string }` |
| `info` | `"Client attached to agent"` | `{ agent: string }` |
| `info` | `"Agent completed"` | `{ agent: string, exit_code: number }` |
| `error` | `"Agent failed"` | `{ agent: string, exit_code: number \| null, signal: string \| null }` |
| `error` | `"Agent exit handler failed"` | `{ agent: string, error: string }` |
| `error` | `"Agent output hook failed"` | `{ agent: string, error: string }` |

Session-scoped events appear in the session's own log stream in the TUI, not in the daemon stream.

## TUI Changes

### `LogsTab` — daemon toggle

A `d` key binding toggles `LogsTab` between two views:

- **Session view** (default): events for the currently selected session, same as today
- **Daemon view**: events for `session_id = "__daemon__"`

The existing level filter keys (`i`, `w`, `e`) and auto-scroll toggle (`f`) continue to work in both views. A visible label indicates which view is active (e.g. `[Session]` / `[Daemon]`).

New state field added to `AppState`:

```ts
logsView: "session" | "daemon"  // default: "session"
```

### Session list filtering

The `"__daemon__"` session must never appear in the session selector (Overview tab, Agents tab, or any other session list). All session list queries in the TUI filter out `session_id = "__daemon__"`.

### No other TUI changes

Level extraction, color coding, pagination, and the `logsFilter` type are all unchanged.

## Out of Scope

- `log.debug` level — not added; three levels (info/warn/error) are sufficient
- Log rotation or retention limits on daemon events
- Server-side log level filtering in the storage layer
- Exposing daemon logs via IPC to external clients
