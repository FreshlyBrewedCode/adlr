# adler — Core + TUI Design

**Date:** 2026-06-11
**Scope:** Phase 1 + 2 — Core foundation, daemon, SDK, CLI, and TUI dashboard
**Out of scope:** Workflows (Phase 3), adler Assistant (Phase 4), Plugin system (Phase 5)

## Phase Map

adler is designed as four sequential build phases. Each phase produces a working system and is a prerequisite for the next.

| Phase | Focus | Key deliverables |
|---|---|---|
| **1 + 2** *(this spec)* | Core + TUI | Daemon, SDK, CLI, SQLite storage, Ink dashboard |
| **3** | Workflows, Hooks, Plugins | YAML workflow engine, before/after hooks, npm plugin system |
| **4** | adler Assistant | AI agent with full session awareness, auto-orchestration mode |
| **Future** | Web UI, remote sessions | Browser dashboard using `@adler/sdk`, multi-user support |

The span/event data model is designed to accommodate Phase 3 and 4 without schema changes. Workflow steps, hook runs, and assistant actions all become spans with the appropriate `kind`.

> **Design artifact:** [scope-overview.html](.superpowers/brainstorm/81281-1781177532/content/scope-overview.html)

---

## 1. Overview

adler is an agent orchestrator focused on observability and flexibility. This spec covers the foundational layer: the daemon that manages sessions and agents, the SDK that wraps it, the CLI that exposes it, and the TUI dashboard that visualises it.

The central design principle is **daemon-as-source-of-truth**: a single background process owns all state and all agent child processes. The CLI and TUI are thin clients that communicate with it over a Unix socket. This means agents survive terminal sessions closing, all writes to the database are serialised through one process, and the persistence backend can be swapped without touching any consumer.

---

## 2. Architecture

> **Design artifact:** [architecture.html](.superpowers/brainstorm/81281-1781177532/content/architecture.html)

```
┌───────────┐   ┌───────────┐
│  adler    │   │  adler    │
│   CLI     │   │   TUI     │
└─────┬─────┘   └─────┬─────┘
      │  Unix socket  │
      └───────┬────────┘
       ┌──────┴──────┐
       │   adlerd    │  ← daemon (Bun)
       └──┬───────┬──┘
          │       │
   ┌──────┴─┐  ┌──┴───────┐
   │ SQLite │  │  Agent   │
   │(bun:   │  │ Processes│
   │sqlite) │  │ (PTY)    │
   └────────┘  └──────────┘
```

### Components

| Package | Role |
|---|---|
| `packages/sdk` | `@adler/sdk` — shared types, Storage interface, IPC protocol, typed client |
| `packages/daemon` | `adlerd` — sole SQLite writer, owns agent processes, pushes events |
| `packages/cli` | `adler` CLI binary — uses SDK client |
| `packages/tui` | Ink dashboard — uses SDK client |
| `packages/plugins/opencode` | `@adler/opencode` — opencode agent definitions |

The `sdk` package is the foundation everything else builds on. It has no runtime dependencies beyond Bun built-ins. `daemon` and plugins import types and interfaces from it. `cli` and `tui` import the client.

### Runtime

**Bun** throughout. Native TypeScript, built-in SQLite (`bun:sqlite`), fast startup, ships as a single binary.

---

## 3. Data Model

> **Design artifact:** [data-model-v2.html](.superpowers/brainstorm/81281-1781177532/content/data-model-v2.html)

Four tables. Schema is intentionally open-ended: new span kinds and event types are conventions, not schema changes.

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `status` | TEXT | `active \| completed \| archived` |
| `working_dir` | TEXT | Absolute path where session was created |
| `created_at` | INTEGER | Unix timestamp ms |

No `goal` field — the session goal is stored as a `context_item` with `type = "goal"`.

### `spans`

Every unit of work is a span. Agents, workflow steps, hooks — all the same table.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `session_id` | TEXT FK | → sessions |
| `parent_id` | TEXT FK? | → spans (nullable) |
| `kind` | TEXT | `agent \| workflow \| step \| hook \| ...` |
| `name` | TEXT | Human-readable name |
| `status` | TEXT | `pending \| running \| done \| failed \| blocked` |
| `started_at` | INTEGER | Unix timestamp ms |
| `finished_at` | INTEGER | Unix timestamp ms, nullable |
| `data` | JSON | Kind-specific fields (see below) |

**`data` by kind:**

- `agent`: `{ prompt, agent_type, pid, exit_code, name, output? }` — `output` is written post-exit by the agent's `output` hook (see §8)
- `workflow`: `{ workflow_name }` *(Phase 3)*
- `step`: `{ workflow_name, step_name, index }` *(Phase 3)*
- `hook`: `{ event, hook_name }` *(Phase 3)*

`output` shape: `{ type: "text", content: string } | { type: "file", path: string }`

Parallel agents appear as sibling spans (same `parent_id`, overlapping timestamps). The TUI uses this to render concurrent execution correctly.

### `events`

Structured notifications about things that have happened. Written to the database, consumed by the TUI and log tab. PTY output is **not** stored here — it is streamed live via a separate `attach` channel (see §4).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `session_id` | TEXT FK | → sessions |
| `span_id` | TEXT FK? | → spans (nullable — session-level events have no span) |
| `type` | TEXT | Open-ended string (see below) |
| `data` | JSON | Event payload |
| `timestamp` | INTEGER | Unix timestamp ms |

**Event types (Phase 1+2):**

| Type | Payload |
|---|---|
| `span.started` | `{ span_id, kind, name }` |
| `span.finished` | `{ span_id, exit_code? }` |
| `span.failed` | `{ span_id, error }` |
| `log.info` | `{ message }` |
| `log.warn` | `{ message }` |
| `log.error` | `{ message }` |
| `context.added` | `{ item_id, type, label }` |
| `session.created` | `{ session_id }` |

`agent.output` is intentionally absent — PTY output is never written to the events table.

New event types can be added freely with no migration.

### Hook triggers (Phase 3 preview)

Hook triggers are conceptually separate from events. They fire at lifecycle points before or after actions, use a colon-separated naming convention, and are never stored in the database. Hook runs appear as `kind = "hook"` spans in the trace.

| Trigger | When |
|---|---|
| `agent:start` | Before agent process is spawned |
| `agent:finish` | After agent process exits |
| `session:create` | Before session is written to storage |

The naming convention (`agent:start` vs `agent.started`) makes the distinction immediately visible at a glance.

### `context_items`

Arbitrary data attached to a session. The goal is a context item.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID |
| `session_id` | TEXT FK | → sessions |
| `type` | TEXT | `goal \| url \| file \| text \| ...` — open-ended |
| `label` | TEXT | Optional short identifier (e.g. `"docs"`, `"spec"`) |
| `description` | TEXT | Optional human-readable description |
| `value` | JSON | Type-specific payload |
| `created_at` | INTEGER | Unix timestamp ms |

**`value` by type:**

- `goal`: `{ "text": "Implement payment feature" }`
- `url`: `{ "url": "https://stripe.com/docs" }`
- `file`: `{ "path": "./docs/spec.md" }`
- `text`: `{ "text": "Use Stripe Elements, not custom card UI" }`

### Storage Interface

The daemon accesses all four tables exclusively through a `Storage` interface defined in `@adler/sdk`. SQLite is the first implementation. Swapping the backend requires only re-implementing this interface.

```ts
interface Storage {
  // Sessions
  createSession(data: CreateSessionInput): Promise<Session>
  getSession(id: string): Promise<Session | null>
  listSessions(): Promise<Session[]>
  updateSession(id: string, data: Partial<Session>): Promise<void>

  // Spans
  createSpan(data: CreateSpanInput): Promise<Span>
  updateSpan(id: string, data: Partial<Span>): Promise<void>
  getSpan(id: string): Promise<Span | null>
  listSpans(sessionId: string): Promise<Span[]>

  // Events
  createEvent(data: CreateEventInput): Promise<Event>
  listEvents(sessionId: string, filter?: EventFilter): Promise<Event[]>

  // Context
  addContextItem(data: AddContextItemInput): Promise<ContextItem>
  listContextItems(sessionId: string, filter?: ContextFilter): Promise<ContextItem[]>
}
```

---

## 4. Daemon

> **Design artifact:** [daemon-cli.html](.superpowers/brainstorm/81281-1781177532/content/daemon-cli.html)

### Lifecycle

- **Socket:** `~/.local/share/adler/adler.sock`
- **Database:** `~/.local/share/adler/adler.db`
- **PID file:** `~/.local/share/adler/adler.pid`
- **Auto-start:** The CLI attempts to connect to the socket. If the connection is refused, it spawns the daemon as a detached Bun process (`detached: true`, `stdio: "ignore"`), then polls the socket at 100ms intervals with a 5-second timeout.
- **Shutdown:** Graceful on `SIGTERM`/`SIGINT` — waits for running agent processes to finish. Also shuts down after 10 minutes of inactivity (no connected clients, no running agents). Manual: `adler daemon stop`.

The daemon is a single global process that manages all sessions across all projects.

### IPC Protocol

Newline-delimited JSON over the Unix socket. Every message has a `type` field.

**CLI → Daemon (commands):**
```json
{ "type": "session.create", "id": "req-1", "payload": { ... } }
{ "type": "agent.run", "id": "req-2", "payload": { "session_id": "...", "agent_type": "opencode:build", "prompt": "...", "name": "git-master", "parent_span_id": "..." } }
{ "type": "context.add", "id": "req-3", "payload": { "session_id": "...", "type": "url", "label": "docs", "value": { "url": "https://..." } } }
{ "type": "subscribe", "id": "req-4", "payload": { "session_id": "..." } }
```

**Daemon → CLI (responses):**
```json
{ "type": "response", "id": "req-1", "payload": { ... } }
{ "type": "error", "id": "req-1", "error": "session not found" }
```

**Daemon → TUI (event stream, after subscribe):**
```json
{ "type": "snapshot", "payload": { "session": {...}, "spans": [...], "events": [...], "context": [...] } }
{ "type": "event", "event": "span.started", "payload": { ... } }
```

**Daemon → attach client (raw PTY stream):**

A client sends `{ "type": "agent.attach", "id": "req-5", "payload": { "span_id": "..." } }`. The daemon responds with raw PTY bytes for the lifetime of the agent process, then closes the stream. This is a separate connection optimised for throughput — no JSON framing, no event overhead.

The TUI sends a `subscribe` command and receives a full snapshot followed by incremental push events for the lifetime of the connection.

### Agent Spawning

1. Daemon creates a span (`kind = "agent"`) in Storage.
2. Daemon spawns the agent command using `Bun.spawn()` with a **PTY** (pseudo-terminal), so agents that are TUIs themselves render correctly.
3. Agent process environment receives:
   ```
   ADLER_SESSION=<session.id>
   ADLER_SPAN_ID=<span.id>
   ADLER_SOCKET=~/.local/share/adler/adler.sock
   ADLER_AGENT_PROMPT=<prompt>
   ADLER_CONTEXT=<JSON array of context_items>
   ```
4. Daemon streams PTY output to all clients currently attached to that span via the `attach` channel (see §4). PTY output is **not** written to the `events` table.
5. **Process completion** depends on the agent's `interactive` flag:
   - `interactive: false` (default): daemon waits for the process to exit naturally, then proceeds to step 6.
   - `interactive: true`: process is not expected to exit on its own. The daemon polls the agent's `status` hook at `statusPollInterval` ms. If no `status` hook is provided, the daemon watches stdout — once no output is received for `interactiveTimeout` ms, `proc.stdoutIdle` is set to `true` and status is inferred as `completed`. The process is **not killed** when completion is detected; it remains running (e.g. an opencode TUI session stays open).
6. On completion, daemon runs the agent's `output` hook (if any), stores the result in `span.data.output`, updates span status (`done`, `failed`, or `blocked`), records `exit_code` in `data` where applicable, emits `span.finished` or `span.failed` event.

### Span Context Propagation

Span context flows through environment variables — the same pattern as W3C Trace Context over HTTP headers, applied to subprocesses.

When an agent (or any subprocess) calls `adler agent run`, the CLI inherits `ADLER_SPAN_ID` from its environment and passes it as `parent_span_id` in the socket command. The daemon sets this as the new span's `parent_id`. Propagation works at any nesting depth automatically — no agent code changes needed.

---

## 5. SDK (`@adler/sdk`)

The SDK is the single interface between consumers (CLI, TUI, future web UI) and the daemon. It wraps the Unix socket connection, handles auto-start, and exposes typed async methods.

```ts
import { createClient } from "@adler/sdk"

const adler = createClient()  // auto-starts daemon if not running

// Environment helpers — reads ADLER_SESSION, ADLER_SPAN_ID, ADLER_SOCKET
const { sessionId, spanId, socketPath } = adler.env()

// Sessions
const session = await adler.session.create()
await adler.session.list()

// Agents
const span = await adler.agent.run({ agentType: "opencode:build", prompt: "...", name: "git-master" })
await adler.agent.wait({ name: "git-master" })
const status = await adler.agent.status({ name: "git-master" })
const agents = await adler.agent.list()

// Attach to a running agent's raw PTY stream (independent of the subscribe event stream)
await adler.agent.attach("git-master")   // accepts name or span id; streams raw PTY to stdout

// Spans
await adler.span.update(spanId, { data: { opencode_session_id: "abc" } }, { merge: true })

// Context
await adler.context.add({ type: "url", label: "docs", value: { url: "https://..." } })
const items = await adler.context.list()

// Structured event stream (state updates, TUI)
adler.subscribe(sessionId, (event) => { /* handle push event */ })

// SDK-level sugar — filtered aliases, no extra storage
adler.on("agent.started", (event) => { /* span.started where kind === "agent" */ })
adler.on("agent.finished", (event) => { /* span.finished where kind === "agent" */ })
```

The SDK also exports all shared types (`Session`, `Span`, `Event`, `ContextItem`, `AdlerConfig`) and the `Storage` interface.

### Span client

```ts
interface SpanClient {
  create(data: CreateSpanInput): Promise<Span>
  get(id: string): Promise<Span | null>
  list(sessionId: string): Promise<Span[]>
  update(id: string, data: Partial<Span>, options?: { merge?: boolean }): Promise<void>
  // merge: true = deep merge data field into existing; false (default) = replace
}
```

`span.data.output` is the standard location for final agent output. It is written by the daemon after the agent's `output` hook runs (see §8). No separate method — just `update` with `merge: true`.

---

## 6. CLI

### Session Resolution

Sessions are resolved in priority order:
1. `--session <id>` flag
2. `ADLER_SESSION` environment variable
3. `.adler/.session` file in the current working directory (written by `adler new`)

### Commands

| Command | Description |
|---|---|
| `adler` | Open TUI dashboard for the current session |
| `adler new [--goal "..."]` | Create a new session; optionally adds a `goal` context item; writes session id to `.adler/.session` |
| `adler agent run --agent <type> [--name <name>] <prompt>` | Command daemon to spawn agent; prints span id |
| `adler agent wait [--name <name>]` | Block until agent span is `done` or `failed` |
| `adler agent status [--name <name>]` | Print current span status |
| `adler agent list` | List all agent spans for current session |
| `adler agent read [--name <name>]` | For a **completed** agent: retrieve and stream stored output from `span.data.output`. For a **running** agent: attach to live PTY stream (same as pressing `enter` in the TUI). |
| `adler context add --type <type> [--label <l>] [--description <d>] <value>` | Add context item |
| `adler context list` | List all context items for current session |
| `adler context get [--type <type>] [--label <label>]` | Get filtered context items (used in workflow prompts) |
| `adler session list` | List all sessions |
| `adler init` | Scaffold `.adler/adler.ts` config in current project |
| `adler daemon stop` | Graceful daemon shutdown |

---

## 7. TUI

> **Design artifacts:**
> - [tui-tabs-v2.html](.superpowers/brainstorm/60777-1781183539/content/tui-tabs-v2.html) — all five tabs
> - [context-tab-v2.html](.superpowers/brainstorm/60777-1781183539/content/context-tab-v2.html) — grouped compact context tab
> - [tui-footer-hotkeys.html](.superpowers/brainstorm/60777-1781183539/content/tui-footer-hotkeys.html) — persistent footer and `?` dialog

### Technology

Built with **Ink** (React for terminals). The `adler` CLI with no arguments mounts the Ink app.

### Data Flow

1. TUI creates an SDK client and calls `adler.subscribe(sessionId, handler)`.
2. Daemon sends a full snapshot immediately on subscribe.
3. TUI initialises React state from the snapshot.
4. All subsequent push events are applied as incremental state updates.
5. Ink re-renders on each state change.

There is no polling. All updates are push-driven from the daemon.

### Layout

Five tabs. Navigation via `tab` / `shift+tab` or number keys `1`–`5`. A persistent footer shows context-sensitive hotkeys for the active tab plus a `?` prompt.

#### Header (always visible)
```
adler · session: abc123 · active · ~/git/myapp
[1: Overview] [2: Context] [3: Agents] [4: Traces] [5: Logs]
```

#### Footer (always visible)
Left side: hotkeys for the active tab rendered as pill badges. Right side: `? help`.

#### `?` Hotkey Dialog
Modal overlay triggered by `?`, dismissed by `?` or `esc`. Sections: Global, Agents, Traces, Logs.

**Global hotkeys:** `tab/shift+tab` next/prev tab, `1-5` jump to tab, `a` open assistant, `q`/`ctrl+c` quit, `?` help.

### Tabs

**1 — Overview**

Split 50/50. Left: session status, working directory, and recent activity (last 5 agent spans with status). Right: context items summary — same compact format as the Context tab but without descriptions.

**2 — Context**

All context items grouped by type. Each type gets a coloured section header (e.g. `GOAL`, `URL — 2 items`, `FILE — 2 items`). Items within each group are single-line: value on the left, dimmed label + description on the right. A coloured left border identifies the type.

Hotkeys: `↑↓` navigate.

**3 — Agents**

Flat list of all agent spans for the current session. Each row: status indicator, agent type, prompt preview (truncated), duration / exit code. The selected item is highlighted.

- `enter` on a **running** agent: suspend Ink, attach to live PTY stream via `adler.agent.attach()`. `ctrl+c` returns to TUI.
- `enter` on a **completed/failed** agent: suspend Ink, retrieve and stream stored output from `span.data.output`. Any key returns.
- `o`: invoke the configurable `agent.attach` hook (e.g. `tmux new-window ...`). No-op if not configured.

Hotkeys: `↑↓` navigate, `enter` attach, `o` open external.

**4 — Traces**

Full span tree rooted at the session. All span kinds rendered (agent, and in Phase 3: workflow, step, hook). Parent–child relationships shown as indented tree. Parallel spans appear as siblings. Selected agent span shows `span.data.output` inline if available; otherwise shows span metadata (status, duration, exit code).

Hotkeys: `↑↓` navigate, `enter` expand/collapse.

**5 — Logs**

Raw event stream in reverse-chronological order. Columns: timestamp, level, event type, span name, message. Filterable by level.

Hotkeys: `i`/`w`/`e` filter info/warn/error, `f` toggle auto-scroll.

### Ink Component Tree

```
<App>                     — SDK subscription, session state
  <Header>                — session id, status, working dir, tab bar
  <OverviewTab>           — summary + context preview
  <ContextTab>            — grouped context items
  <AgentsTab>             — flat agent span list, PTY attach
  <TracesTab>             — recursive span tree
  <LogsTab>               — event stream with filter
  <Footer>                — contextual hotkeys
  <HotkeyDialog>          — modal, shown when isHelpOpen
```

---

## 8. Configuration

Adler is configured via `adler.ts` TypeScript files.

- **Global:** `~/.config/adler/adler.ts`
- **Project:** `.adler/adler.ts`

Project config is merged over global config. Both are optional.

Relevant Phase 1+2 config:

```ts
import type { AdlerConfig } from "@adler/sdk"

const config: AdlerConfig = {
  agent: {
    agents: {
      opencode: {
        // Command to start a new agent session
        run: ({ prompt, subagent }) => `opencode run --agent ${subagent} "${prompt}"`,

        // Command to re-attach to an existing session (e.g. after process is gone but session persists)
        open: ({ span, proc, $ }) => `opencode --session ${span.data.opencode_session_id}`,

        // Runs after agent completes. Return value stored in span.data.output.
        // If omitted, no output is stored.
        output: async ({ span, proc, $ }) => ({
          type: "text",
          content: await $`opencode export --session ${span.data.opencode_session_id}`,
        }),

        // Called on each poll interval to determine agent status.
        // proc.stdoutIdle: true when no stdout change for interactiveTimeout ms.
        // proc.lastStdout: raw last N bytes of PTY buffer (approximation of current screen state).
        // $ is a Bun shell helper.
        // Returns: "working" | "completed" | "failed" | "blocked"
        status: async ({ span, currentStatus, proc, $ }) => {
          if (proc.stdoutIdle) {
            if (proc.lastStdout.includes("permission needed")) return "blocked"
            return "completed"
          }
          return "working"
        },

        // How often the status hook is polled (ms)
        statusPollInterval: 3000,

        // "tui": stdout is escape-sequence-heavy, not useful as plain text output
        // "log": stdout can be treated as readable span output directly
        mode: "tui",

        // true: process is not expected to exit on its own (e.g. an interactive TUI).
        // Completion is detected via the status hook, or via interactiveTimeout if no status hook.
        // Process is NOT killed on completion.
        interactive: true,

        // ms of no stdout change before proc.stdoutIdle = true.
        // Only used when interactive: true and no status hook is provided.
        interactiveTimeout: 3000,
      },
    },

    // Wraps the attach command for external display (e.g. in a tmux window).
    // readCmd: `adler agent read --name <id>` — direct PTY stream
    // openCmd: result of the agent's open hook, if defined; undefined otherwise
    attach: ({ agentId, readCmd, openCmd }) => `tmux new-window "${openCmd ?? readCmd}"`,
  },
}

export default config
```

**Hook context arguments** (`proc`, `$`) are available in all per-agent hooks (`run`, `open`, `output`, `status`):

- `proc.stdoutIdle` — `true` when no stdout change has occurred for `interactiveTimeout` ms
- `proc.lastStdout` — raw last N bytes of the PTY buffer; useful for substring matching against current screen content. Note: this is a raw byte approximation, not a fully rendered terminal frame. Terminal emulation for accurate frame capture is a known limitation and may be addressed in a future phase.
- `$` — Bun shell helper for running subprocesses inline

**`status` hook return values:**

| Value | Meaning |
|---|---|
| `"working"` | Agent is still running normally |
| `"completed"` | Agent has finished successfully |
| `"failed"` | Agent has finished with an error |
| `"blocked"` | Agent requires human input before it can continue |

When no `status` hook is provided and `interactive: true`, the daemon uses `interactiveTimeout` as a fallback: once `proc.stdoutIdle` is true, status is set to `completed`.

The `agent.attach` hook is invoked when the user presses `o` on an agent in the TUI. `openCmd` is `undefined` if the agent type does not define an `open` hook.

---

## 9. Future Phases

### Phase 3 — Workflows, Hooks, Plugins

**Workflow engine:** Reusable multi-step workflows defined in YAML or inline in `adler.ts`. Each step is a prompt that runs an agent. Steps can reference session context via shell interpolation (`$ adler context get --label docs`). Workflows are triggered via `adler run <workflow>` or from the TUI. Workflow and step spans are created automatically — the data model already accommodates them with no schema change.

**Hooks system:** Before/after hooks for any adler lifecycle trigger (`agent:start`, `agent:finish`, `session:create`, etc.). Hook triggers use colon-separated naming and fire at lifecycle points — distinct from the dot-separated event log. Hooks can be shell commands or full TypeScript functions with access to the adler SDK. Hook runs appear as `kind = "hook"` spans in the trace.

**Plugin system:** npm packages that export an `AdlerConfig` object. Plugins contribute pre-built agent definitions, hooks, and workflows. Loaded and merged before local config. First-party plugin: `@adler/opencode`.

### Phase 4 — adler Assistant

An AI agent with full awareness of the current session. Receives the complete session state — spans, events, context, workflow status — as context.

```bash
adler assistant "what has been implemented so far?"
adler assistant --auto "finish the current workflow"
```

In `--auto` mode the assistant reads the session, decides what to do next, runs agents, and iterates until the workflow completes or a human decision is required. The assistant appears as a span in the trace like any other agent.

### Future — Web UI and Remote Sessions

A browser-based dashboard built on `@adler/sdk`. Because the SDK abstracts all daemon communication, the web UI is another SDK consumer — no daemon changes needed. Remote daemon support (TCP socket + auth) would allow the web UI to connect to a daemon running on a different machine.
