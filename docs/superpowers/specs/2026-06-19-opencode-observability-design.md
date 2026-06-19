# OpenCode Observability Plugin — Design Spec

**Date:** 2026-06-19
**Issue:** #12
**Status:** Approved

---

## Overview

Track and expose runtime observability data from opencode sessions into adlr — subagent lifecycle, token usage, and cost tracking. Implemented as a published npm package (`@adlr/plugin-opencode`) that hooks into the opencode plugin API and forwards telemetry to the adlr daemon over the existing Unix socket protocol.

---

## Motivation

adlr orchestrates agents running inside opencode. To give operators full visibility ("eagle eyes on your agents"), adlr needs real-time telemetry from opencode processes: when subagents start and stop, how much of the context window is consumed, and what the monetary cost is per session and subagent. The opencode plugin API (`@opencode-ai/plugin`) provides access to all server-sent events and is sufficient for comprehensive observability.

---

## Package Changes

### 1. `@adlr/sdk` — Typed span data + new client methods

#### 1a. Move `SqliteStorage` to daemon

`packages/sdk/src/sqlite-storage.ts` moves to `packages/daemon/src/sqlite-storage.ts`. The daemon is the only consumer of SQLite and the only process that should own the storage implementation.

The `Storage` interface (`packages/sdk/src/storage.ts`) stays in the SDK — it is pure TypeScript with no runtime dependencies and is part of the public contract.

The SDK's `index.ts` stops exporting `SqliteStorage`.

#### 1b. Typed `Span` discriminated union

The `Span` type becomes a discriminated union. `AgentSpan` is the only fully-typed variant; the other kinds (`workflow`, `step`, `hook`) fall back to `BaseSpan` with `data: Record<string, unknown>` as placeholders for future typing.

```ts
// New types in packages/sdk/src/types.ts

export interface SpanUsage {
  tokens: {
    input: number
    output: number
    cache_read: number
    cache_write: number
  }
  cost_usd: number
  model_id?: string
  provider_id?: string
}

export interface AgentSpanData {
  prompt?: string
  agent_type?: string
  pid?: number | null
  exit_code?: number | null
  output?: string
  usage?: SpanUsage
}

export interface AgentSpan extends BaseSpan {
  kind: "agent"
  data: AgentSpanData
}

// BaseSpan = existing Span interface, renamed
// Span = AgentSpan | BaseSpan
export type Span = AgentSpan | BaseSpan

// Map from kind → data type (for generic client methods)
export type SpanDataMap = {
  agent: AgentSpanData
  workflow: Record<string, unknown>
  step: Record<string, unknown>
  hook: Record<string, unknown>
}
```

The existing `Span` interface is renamed `BaseSpan` internally. All existing code that uses `Span` continues to work — `AgentSpan` is assignable to `BaseSpan`.

#### 1c. Generic client methods

The client gains type parameters on methods that touch `data`, keyed by `SpanKind`:

```ts
client.span.create<K extends SpanKind>(input: CreateSpanInput<K>): Promise<SpanOf<K>>
client.span.update<K extends SpanKind>(id: string, data: Partial<SpanDataMap[K]>, options?: { merge?: boolean }): Promise<void>
client.span.get<K extends SpanKind>(id: string): Promise<SpanOf<K>>
client.span.finish(id: string, status?: "done" | "failed"): Promise<void>
```

All methods default to the untyped `BaseSpan` / `Record<string, unknown>` when no type parameter is supplied, preserving backward compatibility.

---

### 2. `packages/daemon` — New commands + receive SqliteStorage

#### 2a. Receive `SqliteStorage`

`sqlite-storage.ts` moves here from the SDK. No behaviour changes — this is a file relocation only. Internal imports in the daemon are updated accordingly.

#### 2b. `span.create` command

Creates a span record without spawning a process. Payload:

```ts
{
  session_id: string
  parent_id?: string | null
  kind: SpanKind
  name: string
  status?: SpanStatus   // defaults to "pending"
  data?: Record<string, unknown>
}
```

`session_id` is required in the payload and must match an existing session (typically `ADLR_SESSION` from the caller's environment). Broadcasts `span.started`. Returns the created `Span`.

#### 2c. `span.finish` command

Closes a span. Payload:

```ts
{
  id: string
  status?: "done" | "failed"   // defaults to "done"
}
```

Sets `finished_at` to `Date.now()`, updates `status`, broadcasts `span.finished` or `span.failed`. Returns `{ success: true }`.

---

### 3. `packages/plugins/opencode` — New plugin package

**Package name:** `@adlr/plugin-opencode`  
**Location:** `packages/plugins/opencode`  
**Runtime dependency:** `@adlr/sdk`, `@opencode-ai/plugin`

A single opencode plugin export that registers an `event` hook. It maintains an in-memory map of `opencode sessionID → adlr span ID` for subagent tracking.

#### 3a. Root span resolution

The plugin operates in three modes depending on environment variables:

| Mode | Condition | Behaviour |
|---|---|---|
| Managed | `ADLR_SPAN_ID` set | Use existing span as root. No `span.create` for root. |
| Session-attached | `ADLR_SESSION` + `ADLR_SOCKET` set, no `ADLR_SPAN_ID` | Create root span on first meaningful event. Store ID in memory. |
| Standalone | None of the above | No-op. Plugin loads but does nothing. |

#### 3b. Event mapping

| opencode event | Condition | adlr action |
|---|---|---|
| `session.created` | `properties.info.parentID` set | `span.create<"agent">` as child of root span; store `sessionID → spanID` |
| `session.idle` | `sessionID` in map | `span.finish(spanID, "done")` |
| `session.deleted` | `sessionID` in map, not already finished | `span.finish(spanID, "done")` |
| `message.part.updated` | `part.type === "step-finish"` | `span.update<"agent">` — merge usage onto mapped span (fallback: root span) |
| `session.updated` | always | `span.update<"agent">` — merge cumulative cost/tokens onto root span |

#### 3c. Usage accumulation

Cost is accumulated from `step-finish` parts as the primary source (reliable per the investigation). `session.updated` cost overrides if present on the event — this handles the case where opencode tracks cost at the session level. The `step-finish` path is the safe fallback.

#### 3d. Plugin registration

Users add the plugin to their `.opencode/plugins/` directory or reference the package in their opencode config. The package exports a single named `Plugin` conforming to `@opencode-ai/plugin`'s `Plugin` type.

---

### 4. `packages/tui` — Usage display in existing panels

Token and cost data surfaces in three existing panels. No new panels or tabs are added.

#### Agents panel

Each agent card gains a compact usage summary line when `AgentSpanData.usage` is present:

```
↑ 1.2k  ↓ 340  $0.04
```

Input tokens (↑), output tokens (↓), cost in USD. Shown below the existing prompt/status row. Hidden when `usage` is absent.

#### Traces panel

Each tree node for an `AgentSpan` gains the same compact usage summary appended inline to the right of the status indicator. Non-agent spans are unaffected.

#### Overview panel

The session summary on the left gains a cumulative line summing cost and tokens across all `AgentSpan` nodes in the current session:

```
Total:  ↑ 14.3k  ↓ 2.1k  $0.31
```

Shown only when at least one span has usage data.

---

## Data Flow

```
adlr daemon
  └─ agent.run → spawns opencode process
       └─ injects ADLR_SOCKET, ADLR_SESSION, ADLR_SPAN_ID

opencode process
  └─ @adlr/plugin-opencode (event hook)
       ├─ session.created (parentID set) → span.create<"agent"> → child span
       ├─ message.part.updated (step-finish) → span.update<"agent"> → merge usage
       ├─ session.updated → span.update<"agent"> → merge cumulative cost/tokens
       └─ session.idle → span.finish → child span done

adlr daemon
  └─ broadcasts span.started / span.finished / span events over socket

@adlr/tui
  └─ live subscribe → reducer updates spans[]
       ├─ Agents panel → reads AgentSpanData.usage → renders usage line
       ├─ Traces panel → same inline on agent tree nodes
       └─ Overview panel → sums cost/tokens across all AgentSpans
```

---

## Open Questions (carry into implementation)

1. **Cost rollup for subagents** — the investigation found `cost = 0` in the SQLite DB for child opencode sessions. Needs empirical verification: does `session.updated` for a child session carry cost, or must it be aggregated from `step-finish` parts? The plugin handles both paths; implementation should verify which is reliable.

2. **v2 event availability** — the `@opencode-ai/plugin` SDK v2 defines richer `session.next.*` events (e.g. `session.next.step.ended`), but the plugin `event` hook types them as the v1 `Event` union. Needs live verification during implementation whether these events reach the hook in practice.

---

## Out of Scope

- Agent config integration (how to configure an observability-only agent in `adlr.ts`) — deferred; the plugin works independently of agent config.
- Typed data shapes for `workflow`, `step`, `hook` span kinds — placeholder `Record<string, unknown>` for now.
- Historical cost/token queries or aggregation in the daemon — TUI reads live data from the span tree only.
