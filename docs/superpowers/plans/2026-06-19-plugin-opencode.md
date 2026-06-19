# OpenCode Observability Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Dependencies:** This plan must be executed **after** both `docs/superpowers/plans/2026-06-19-sdk-refactor.md` and `docs/superpowers/plans/2026-06-19-daemon-commands.md` complete.

**Goal:** Implement `@adlr/plugin-opencode` — a published opencode plugin that forwards subagent lifecycle, token usage, and cost telemetry to the adlr daemon.

**Architecture:** A single plugin export with an `event` hook. Three internal modules handle mode detection (env vars), span tracking (in-memory map), and event dispatch. The plugin is a no-op when adlr env vars are absent.

**Tech Stack:** Bun, TypeScript, bun:test, `@adlr/sdk`, `@opencode-ai/plugin`

**Spec reference:** `docs/superpowers/specs/2026-06-19-opencode-observability-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `packages/plugins/opencode/package.json` | Package manifest — `@adlr/plugin-opencode` v0.1.0 |
| Create | `packages/plugins/opencode/tsconfig.json` | Extends root tsconfig |
| Create | `packages/plugins/opencode/src/types.ts` | `AdlrClient` interface + opencode event shapes |
| Create | `packages/plugins/opencode/src/resolve-mode.ts` | `resolveMode()` — reads env vars, returns `managed | session-attached | standalone` |
| Create | `packages/plugins/opencode/src/span-map.ts` | `SpanMap` — in-memory `sessionID → spanID` map |
| Create | `packages/plugins/opencode/src/root-span-resolver.ts` | `RootSpanResolver` — lazy root span creation for session-attached mode |
| Create | `packages/plugins/opencode/src/handle-event.ts` | `handleEvent(event, ctx)` — pure event dispatch logic |
| Create | `packages/plugins/opencode/src/index.ts` | `ObservabilityPlugin` export — wires everything together |
| Create | `packages/plugins/opencode/test/types.test.ts` | Structural test for event discriminants and `AdlrClient` interface |
| Create | `packages/plugins/opencode/test/resolve-mode.test.ts` | 6 tests for `resolveMode` across all 3 modes and partial env |
| Create | `packages/plugins/opencode/test/span-map.test.ts` | Tests for `SpanMap` — set/get/has/markFinished/isFinished/delete |
| Create | `packages/plugins/opencode/test/root-span-resolver.test.ts` | Tests for `RootSpanResolver` — lazy creation, concurrency, managed mode |
| Create | `packages/plugins/opencode/test/handle-event.test.ts` | 15+ tests for `handleEvent` — all 5 event branches |
| Create | `packages/plugins/opencode/test/index.test.ts` | 6 integration tests for `ObservabilityPlugin` factory |

---

### Task 1: Package scaffold

**Files:**
- Create: `packages/plugins/opencode/package.json`
- Create: `packages/plugins/opencode/tsconfig.json`

No tests for config files — verify Bun picks up the package.

- [ ] **Step 1: Create `packages/plugins/opencode/package.json`**

```json
{
  "name": "@adlr/plugin-opencode",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "test": "bun test",
    "lint": "biome check .",
    "typecheck": "tsgo --noEmit"
  },
  "peerDependencies": {
    "@adlr/sdk": "workspace:*",
    "@opencode-ai/plugin": ">=1.17.0"
  },
  "devDependencies": {
    "@adlr/sdk": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/plugins/opencode/tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "."
  },
  "include": ["./**/*"]
}
```

- [ ] **Step 3: Run `bun install` from repo root**

```bash
bun install
```

Expected: no errors; `@adlr/plugin-opencode` appears in workspace.

- [ ] **Step 4: Verify `bun test packages/plugins/opencode` runs (0 tests, no errors)**

```bash
bun test packages/plugins/opencode
```

Expected: "No test files found" or "0 tests" — package is picked up by Bun workspace with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/opencode/package.json packages/plugins/opencode/tsconfig.json
git commit -m "feat(plugin-opencode): scaffold package"
```

---

### Task 2: Types module

**Files:**
- Create: `packages/plugins/opencode/src/types.ts`
- Create: `packages/plugins/opencode/test/types.test.ts`

The plugin needs a minimal `AdlrClient` interface so tests can inject a mock without a real socket. We also define all opencode event shapes the plugin handles.

Note: `AgentSpanData` is imported from `@adlr/sdk` — that type will exist once the sdk-refactor plan lands. The `AdlrClient` interface uses the generic `span.create<K>` signature from that same plan.

- [ ] **Step 1: Write the failing test**

Create `packages/plugins/opencode/test/types.test.ts`:

```ts
import { test, expect, describe } from "bun:test"
import type {
  AdlrClient,
  OpenCodeEvent,
  SessionCreatedEvent,
  SessionIdleEvent,
  SessionDeletedEvent,
  SessionUpdatedEvent,
  StepFinishPartUpdatedEvent,
} from "../src/types"

describe("AdlrClient interface", () => {
  test("mock object satisfies AdlrClient structurally", () => {
    const calls: string[] = []

    const mock: AdlrClient = {
      span: {
        create: async (input) => {
          calls.push(`create:${input.name}`)
          return {
            id: "span-1",
            session_id: input.session_id,
            parent_id: input.parent_id ?? null,
            kind: input.kind,
            name: input.name,
            status: "running" as const,
            started_at: Date.now(),
            finished_at: null,
            data: input.data ?? {},
          }
        },
        finish: async (id, _status) => {
          calls.push(`finish:${id}`)
        },
        update: async (id, _data, _options) => {
          calls.push(`update:${id}`)
        },
      },
    }

    expect(mock.span).toBeDefined()
    expect(typeof mock.span.create).toBe("function")
    expect(typeof mock.span.finish).toBe("function")
    expect(typeof mock.span.update).toBe("function")
  })
})

describe("OpenCodeEvent discriminant union", () => {
  test("session.created event discriminant is correct", () => {
    const event: OpenCodeEvent = {
      type: "session.created",
      properties: { info: { id: "s1", parentID: "p1", title: "my-agent" } },
    }
    expect(event.type).toBe("session.created")
    if (event.type === "session.created") {
      expect(event.properties.info.id).toBe("s1")
      expect(event.properties.info.parentID).toBe("p1")
    }
  })

  test("session.idle event discriminant is correct", () => {
    const event: OpenCodeEvent = {
      type: "session.idle",
      properties: { sessionID: "s2" },
    }
    expect(event.type).toBe("session.idle")
    if (event.type === "session.idle") {
      expect(event.properties.sessionID).toBe("s2")
    }
  })

  test("session.deleted event discriminant is correct", () => {
    const event: OpenCodeEvent = {
      type: "session.deleted",
      properties: { sessionID: "s3" },
    }
    if (event.type === "session.deleted") {
      expect(event.properties.sessionID).toBe("s3")
    }
  })

  test("message.part.updated (step-finish) event discriminant is correct", () => {
    const event: OpenCodeEvent = {
      type: "message.part.updated",
      properties: {
        sessionID: "s4",
        part: {
          type: "step-finish",
          tokens: { total: 100, input: 80, output: 20, cache: { write: 0, read: 5 } },
          cost: 0.001,
        },
      },
    }
    if (event.type === "message.part.updated") {
      expect(event.properties.sessionID).toBe("s4")
      expect(event.properties.part.type).toBe("step-finish")
    }
  })

  test("session.updated event discriminant is correct", () => {
    const event: OpenCodeEvent = {
      type: "session.updated",
      properties: { info: { id: "s5", cost: 0.05, tokens: { input: 1000, output: 200 } } },
    }
    if (event.type === "session.updated") {
      expect(event.properties.info.cost).toBe(0.05)
    }
  })

  test("unknown event type falls through to catch-all", () => {
    const event: OpenCodeEvent = {
      type: "some.unknown.event",
      properties: {},
    }
    expect(event.type).toBe("some.unknown.event")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/plugins/opencode/test/types.test.ts
```

Expected: FAIL — `Cannot find module '../src/types'`

- [ ] **Step 3: Create `packages/plugins/opencode/src/types.ts`**

```ts
import type { AgentSpanData, Span, SpanKind, SpanStatus } from "@adlr/sdk"

// Minimal subset of the @adlr/sdk Client that this plugin uses.
// The real createClient() return value satisfies this interface structurally.
export interface AdlrClient {
  span: {
    create(input: {
      session_id: string
      parent_id?: string | null
      kind: SpanKind
      name: string
      status?: SpanStatus
      data?: Record<string, unknown>
    }): Promise<Span>
    finish(id: string, status?: "done" | "failed"): Promise<void>
    update(
      id: string,
      data: Partial<AgentSpanData>,
      options?: { merge?: boolean },
    ): Promise<void>
  }
}

// Opencode event shapes used by the plugin.
export interface SessionCreatedEvent {
  type: "session.created"
  properties: {
    info: {
      id: string
      parentID?: string | null
      title?: string
    }
  }
}

export interface SessionIdleEvent {
  type: "session.idle"
  properties: { sessionID: string }
}

export interface SessionDeletedEvent {
  type: "session.deleted"
  properties: { sessionID: string }
}

export interface StepFinishPart {
  type: "step-finish"
  tokens: {
    total: number
    input: number
    output: number
    reasoning?: number
    cache?: { write: number; read: number }
  }
  cost: number
}

export interface StepFinishPartUpdatedEvent {
  type: "message.part.updated"
  properties: {
    sessionID: string
    part: { type: string } & Partial<StepFinishPart>
  }
}

export interface SessionUpdatedEvent {
  type: "session.updated"
  properties: {
    info: {
      id: string
      cost?: number
      tokens?: {
        input?: number
        output?: number
        cache?: { read?: number; write?: number }
      }
    }
  }
}

export type OpenCodeEvent =
  | SessionCreatedEvent
  | SessionIdleEvent
  | SessionDeletedEvent
  | StepFinishPartUpdatedEvent
  | SessionUpdatedEvent
  | { type: string; properties: Record<string, unknown> }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test packages/plugins/opencode/test/types.test.ts
```

Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/opencode/src/types.ts packages/plugins/opencode/test/types.test.ts
git commit -m "feat(plugin-opencode): add AdlrClient interface and opencode event types"
```

---

### Task 3: `resolveMode` — env-var mode detection

**Files:**
- Create: `packages/plugins/opencode/src/resolve-mode.ts`
- Create: `packages/plugins/opencode/test/resolve-mode.test.ts`

`resolveMode` takes the env record explicitly (not `process.env` directly) so it is pure and trivially testable. The caller passes `process.env` at the call site.

- [ ] **Step 1: Write the failing tests**

Create `packages/plugins/opencode/test/resolve-mode.test.ts`:

```ts
import { test, expect, describe } from "bun:test"
import { resolveMode } from "../src/resolve-mode"

describe("resolveMode", () => {
  test("standalone — no env vars set", () => {
    expect(resolveMode({})).toEqual({ mode: "standalone" })
  })

  test("standalone — only ADLR_SESSION set (no socket)", () => {
    expect(resolveMode({ ADLR_SESSION: "sess-1" })).toEqual({ mode: "standalone" })
  })

  test("standalone — only ADLR_SOCKET set (no session)", () => {
    expect(resolveMode({ ADLR_SOCKET: "/tmp/adlr.sock" })).toEqual({ mode: "standalone" })
  })

  test("session-attached — ADLR_SESSION + ADLR_SOCKET set, no ADLR_SPAN_ID", () => {
    expect(
      resolveMode({ ADLR_SESSION: "sess-2", ADLR_SOCKET: "/tmp/adlr.sock" })
    ).toEqual({
      mode: "session-attached",
      sessionId: "sess-2",
      socketPath: "/tmp/adlr.sock",
    })
  })

  test("managed — all three env vars set", () => {
    expect(
      resolveMode({
        ADLR_SOCKET: "/tmp/adlr.sock",
        ADLR_SESSION: "sess-3",
        ADLR_SPAN_ID: "span-abc",
      })
    ).toEqual({
      mode: "managed",
      spanId: "span-abc",
      sessionId: "sess-3",
      socketPath: "/tmp/adlr.sock",
    })
  })

  test("managed — ADLR_SPAN_ID set without session/socket (degenerate but valid)", () => {
    const result = resolveMode({ ADLR_SPAN_ID: "span-xyz" })
    expect(result.mode).toBe("managed")
    if (result.mode === "managed") {
      expect(result.spanId).toBe("span-xyz")
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test packages/plugins/opencode/test/resolve-mode.test.ts
```

Expected: FAIL — `Cannot find module '../src/resolve-mode'`

- [ ] **Step 3: Create `packages/plugins/opencode/src/resolve-mode.ts`**

```ts
export type PluginMode =
  | { mode: "managed"; spanId: string; sessionId: string; socketPath: string }
  | { mode: "session-attached"; sessionId: string; socketPath: string }
  | { mode: "standalone" }

export function resolveMode(env: Record<string, string | undefined>): PluginMode {
  const socketPath = env.ADLR_SOCKET
  const sessionId = env.ADLR_SESSION
  const spanId = env.ADLR_SPAN_ID
  if (socketPath && sessionId && spanId) return { mode: "managed", spanId, sessionId, socketPath }
  if (socketPath && sessionId) return { mode: "session-attached", sessionId, socketPath }
  return { mode: "standalone" }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/plugins/opencode/test/resolve-mode.test.ts
```

Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/opencode/src/resolve-mode.ts packages/plugins/opencode/test/resolve-mode.test.ts
git commit -m "feat(plugin-opencode): add resolveMode for env-based plugin mode detection"
```

---

### Task 4: `SpanMap` — in-memory opencode sessionID → adlr spanID tracking

**Files:**
- Create: `packages/plugins/opencode/src/span-map.ts`
- Create: `packages/plugins/opencode/test/span-map.test.ts`

Tracks `opencode sessionID → adlr spanID` and remembers which spans have been finished to guard against double-finish from `session.idle` + `session.deleted` arriving for the same session.

- [ ] **Step 1: Write the failing tests**

Create `packages/plugins/opencode/test/span-map.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test"
import { SpanMap } from "../src/span-map"

describe("SpanMap", () => {
  let map: SpanMap

  beforeEach(() => {
    map = new SpanMap()
  })

  test("set and get a span ID", () => {
    map.set("oc-session-1", "adlr-span-1")
    expect(map.get("oc-session-1")).toBe("adlr-span-1")
  })

  test("get returns undefined for unknown session", () => {
    expect(map.get("unknown")).toBeUndefined()
  })

  test("has returns true when session is present", () => {
    map.set("oc-session-2", "adlr-span-2")
    expect(map.has("oc-session-2")).toBe(true)
  })

  test("has returns false when session is absent", () => {
    expect(map.has("absent")).toBe(false)
  })

  test("markFinished sets isFinished to true", () => {
    map.set("oc-session-3", "adlr-span-3")
    expect(map.isFinished("oc-session-3")).toBe(false)
    map.markFinished("oc-session-3")
    expect(map.isFinished("oc-session-3")).toBe(true)
  })

  test("isFinished returns false for unknown session", () => {
    expect(map.isFinished("never-set")).toBe(false)
  })

  test("delete removes the session entry and clears finished state", () => {
    map.set("oc-session-4", "adlr-span-4")
    map.markFinished("oc-session-4")
    map.delete("oc-session-4")
    expect(map.has("oc-session-4")).toBe(false)
    expect(map.get("oc-session-4")).toBeUndefined()
    expect(map.isFinished("oc-session-4")).toBe(false)
  })

  test("multiple sessions are tracked independently", () => {
    map.set("s1", "span-1")
    map.set("s2", "span-2")
    map.markFinished("s1")

    expect(map.isFinished("s1")).toBe(true)
    expect(map.isFinished("s2")).toBe(false)
    expect(map.get("s2")).toBe("span-2")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test packages/plugins/opencode/test/span-map.test.ts
```

Expected: FAIL — `Cannot find module '../src/span-map'`

- [ ] **Step 3: Create `packages/plugins/opencode/src/span-map.ts`**

```ts
export class SpanMap {
  private map = new Map<string, string>()
  private finished = new Set<string>()
  set(opencodeSessionId: string, adlrSpanId: string): void { this.map.set(opencodeSessionId, adlrSpanId) }
  get(opencodeSessionId: string): string | undefined { return this.map.get(opencodeSessionId) }
  has(opencodeSessionId: string): boolean { return this.map.has(opencodeSessionId) }
  markFinished(opencodeSessionId: string): void { this.finished.add(opencodeSessionId) }
  isFinished(opencodeSessionId: string): boolean { return this.finished.has(opencodeSessionId) }
  delete(opencodeSessionId: string): void { this.map.delete(opencodeSessionId); this.finished.delete(opencodeSessionId) }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/plugins/opencode/test/span-map.test.ts
```

Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/opencode/src/span-map.ts packages/plugins/opencode/test/span-map.test.ts
git commit -m "feat(plugin-opencode): add SpanMap for opencode→adlr span ID tracking"
```

---

### Task 5: `RootSpanResolver` — lazy root span creation for session-attached mode

**Files:**
- Create: `packages/plugins/opencode/src/root-span-resolver.ts`
- Create: `packages/plugins/opencode/test/root-span-resolver.test.ts`

In managed mode, the root span ID is already known (`ADLR_SPAN_ID`). In session-attached mode, no span exists yet — the resolver creates one lazily on the first call to `resolve()`, and ensures concurrent callers only trigger one creation.

- [ ] **Step 1: Write the failing tests**

Create `packages/plugins/opencode/test/root-span-resolver.test.ts`:

```ts
import { test, expect, describe } from "bun:test"
import type { AgentSpanData } from "@adlr/sdk"
import type { AdlrClient } from "../src/types"
import { RootSpanResolver } from "../src/root-span-resolver"

let spanCounter = 0

function makeMockClient(spanId = "root-span-1"): {
  client: AdlrClient
  createCalls: Array<Parameters<AdlrClient["span"]["create"]>[0]>
} {
  const createCalls: Array<Parameters<AdlrClient["span"]["create"]>[0]> = []

  const client: AdlrClient = {
    span: {
      create: async (input) => {
        createCalls.push(input)
        return {
          id: spanId,
          session_id: input.session_id,
          parent_id: input.parent_id ?? null,
          kind: input.kind,
          name: input.name,
          status: "running" as const,
          started_at: Date.now(),
          finished_at: null,
          data: {},
        }
      },
      finish: async () => {},
      update: async () => {},
    },
  }

  return { client, createCalls }
}

describe("RootSpanResolver", () => {
  test("resolve() creates span on first call", async () => {
    const { client, createCalls } = makeMockClient("root-span-1")
    const resolver = new RootSpanResolver("adlr-sess-1", client)

    const id = await resolver.resolve()

    expect(id).toBe("root-span-1")
    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]).toMatchObject({
      session_id: "adlr-sess-1",
      kind: "agent",
      name: "opencode",
      status: "running",
    })
  })

  test("resolve() returns cached span ID on second call — no second create", async () => {
    const { client, createCalls } = makeMockClient("root-span-2")
    const resolver = new RootSpanResolver("adlr-sess-2", client)

    const id1 = await resolver.resolve()
    const id2 = await resolver.resolve()

    expect(id1).toBe("root-span-2")
    expect(id2).toBe("root-span-2")
    expect(createCalls).toHaveLength(1)
  })

  test("concurrent resolve() calls only create one span", async () => {
    const { client, createCalls } = makeMockClient("root-span-3")
    const resolver = new RootSpanResolver("adlr-sess-3", client)

    const [id1, id2, id3] = await Promise.all([
      resolver.resolve(),
      resolver.resolve(),
      resolver.resolve(),
    ])

    expect(id1).toBe("root-span-3")
    expect(id2).toBe("root-span-3")
    expect(id3).toBe("root-span-3")
    expect(createCalls).toHaveLength(1)
  })

  test("managed mode: provided spanId is returned without calling span.create", async () => {
    const { client, createCalls } = makeMockClient("should-not-be-used")
    const resolver = new RootSpanResolver("adlr-sess-4", client, "existing-span-id")

    const id = await resolver.resolve()

    expect(id).toBe("existing-span-id")
    expect(createCalls).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test packages/plugins/opencode/test/root-span-resolver.test.ts
```

Expected: FAIL — `Cannot find module '../src/root-span-resolver'`

- [ ] **Step 3: Create `packages/plugins/opencode/src/root-span-resolver.ts`**

```ts
import type { AgentSpanData } from "@adlr/sdk"
import type { AdlrClient } from "./types"

export class RootSpanResolver {
  private spanId: string | undefined
  private creating: Promise<string> | undefined

  constructor(
    private readonly sessionId: string,
    private readonly client: AdlrClient,
    managedSpanId?: string,
  ) {
    this.spanId = managedSpanId
  }

  async resolve(): Promise<string> {
    if (this.spanId) return this.spanId
    if (this.creating) return this.creating
    this.creating = this.client.span
      .create<"agent">({
        session_id: this.sessionId,
        kind: "agent",
        name: "opencode",
        status: "running",
      })
      .then((span) => {
        this.spanId = span.id
        return span.id
      })
    return this.creating
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/plugins/opencode/test/root-span-resolver.test.ts
```

Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/opencode/src/root-span-resolver.ts packages/plugins/opencode/test/root-span-resolver.test.ts
git commit -m "feat(plugin-opencode): add RootSpanResolver for lazy root span creation"
```

---

### Task 6: `handleEvent` — core event dispatch

**Files:**
- Create: `packages/plugins/opencode/src/handle-event.ts`
- Create: `packages/plugins/opencode/test/handle-event.test.ts`

`handleEvent` is a pure async function. It reads no process state — everything is passed through `ctx`. This makes it fully unit-testable with a mock client. All 5 event types from the spec are covered.

- [ ] **Step 1: Write the failing tests**

Create `packages/plugins/opencode/test/handle-event.test.ts`:

```ts
import { test, expect, describe, beforeEach } from "bun:test"
import type { AdlrClient, OpenCodeEvent } from "../src/types"
import { SpanMap } from "../src/span-map"
import { RootSpanResolver } from "../src/root-span-resolver"
import { handleEvent, type PluginContext } from "../src/handle-event"

let spanCounter = 0

function makeMock(rootSpanId = "root-span") {
  spanCounter = 0
  const createCalls: Array<Parameters<AdlrClient["span"]["create"]>[0]> = []
  const finishCalls: Array<{ id: string; status?: "done" | "failed" }> = []
  const updateCalls: Array<{ id: string; data: Record<string, unknown>; options?: { merge?: boolean } }> = []

  const client: AdlrClient = {
    span: {
      create: async (input) => {
        createCalls.push(input)
        return {
          id: `span-${++spanCounter}`,
          session_id: input.session_id,
          parent_id: input.parent_id ?? null,
          kind: input.kind,
          name: input.name,
          status: "running" as const,
          started_at: Date.now(),
          finished_at: null,
          data: {},
        }
      },
      finish: async (id, status) => { finishCalls.push({ id, status }) },
      update: async (id, data, options) => { updateCalls.push({ id, data: data as Record<string, unknown>, options }) },
    },
  }

  const spanMap = new SpanMap()
  const rootResolver = new RootSpanResolver("adlr-session-1", client, rootSpanId)

  const ctx: PluginContext = {
    client,
    spanMap,
    rootResolver,
    sessionId: "adlr-session-1",
  }

  return { client, ctx, createCalls, finishCalls, updateCalls, spanMap }
}

describe("handleEvent — session.created", () => {
  test("creates child span as child of root span when parentID is set", async () => {
    const { ctx, createCalls, spanMap } = makeMock("root-span")
    await handleEvent({
      type: "session.created",
      properties: { info: { id: "oc-sub-1", parentID: "oc-parent-1", title: "subagent" } },
    }, ctx)

    expect(createCalls).toHaveLength(1)
    expect(createCalls[0]).toMatchObject({
      session_id: "adlr-session-1",
      parent_id: "root-span",
      kind: "agent",
      name: "subagent",
    })
    expect(spanMap.has("oc-sub-1")).toBe(true)
  })

  test("stores opencodeSessionID→adlrSpanID in spanMap after creation", async () => {
    const { ctx, spanMap } = makeMock("root-span")
    await handleEvent({
      type: "session.created",
      properties: { info: { id: "oc-sub-2", parentID: "oc-parent-1" } },
    }, ctx)

    expect(spanMap.get("oc-sub-2")).toBeDefined()
  })

  test("does NOT create span when parentID is absent (root session — not a subagent)", async () => {
    const { ctx, createCalls } = makeMock()
    await handleEvent({
      type: "session.created",
      properties: { info: { id: "oc-root-1" } },
    }, ctx)

    expect(createCalls).toHaveLength(0)
  })

  test("uses session title as span name when present", async () => {
    const { ctx, createCalls } = makeMock()
    await handleEvent({
      type: "session.created",
      properties: { info: { id: "oc-titled", parentID: "oc-parent", title: "my-agent" } },
    }, ctx)

    expect(createCalls[0].name).toBe("my-agent")
  })

  test("falls back to sessionID as span name when title is absent", async () => {
    const { ctx, createCalls } = makeMock()
    await handleEvent({
      type: "session.created",
      properties: { info: { id: "oc-no-title", parentID: "oc-parent" } },
    }, ctx)

    expect(createCalls[0].name).toBe("oc-no-title")
  })
})

describe("handleEvent — session.idle", () => {
  test("finishes the mapped span when sessionID is in spanMap", async () => {
    const { ctx, finishCalls, spanMap } = makeMock()
    spanMap.set("oc-sub-3", "adlr-span-3")

    await handleEvent({
      type: "session.idle",
      properties: { sessionID: "oc-sub-3" },
    }, ctx)

    expect(finishCalls).toHaveLength(1)
    expect(finishCalls[0]).toEqual({ id: "adlr-span-3", status: "done" })
    expect(spanMap.isFinished("oc-sub-3")).toBe(true)
  })

  test("does nothing when sessionID is not in spanMap", async () => {
    const { ctx, finishCalls } = makeMock()
    await handleEvent({
      type: "session.idle",
      properties: { sessionID: "unknown-session" },
    }, ctx)

    expect(finishCalls).toHaveLength(0)
  })
})

describe("handleEvent — session.deleted", () => {
  test("finishes span when in spanMap and not already finished", async () => {
    const { ctx, finishCalls, spanMap } = makeMock()
    spanMap.set("oc-sub-4", "adlr-span-4")

    await handleEvent({
      type: "session.deleted",
      properties: { sessionID: "oc-sub-4" },
    }, ctx)

    expect(finishCalls).toHaveLength(1)
    expect(finishCalls[0]).toEqual({ id: "adlr-span-4", status: "done" })
  })

  test("does NOT finish span when already finished (double-finish guard)", async () => {
    const { ctx, finishCalls, spanMap } = makeMock()
    spanMap.set("oc-sub-5", "adlr-span-5")
    spanMap.markFinished("oc-sub-5")

    await handleEvent({
      type: "session.deleted",
      properties: { sessionID: "oc-sub-5" },
    }, ctx)

    expect(finishCalls).toHaveLength(0)
  })

  test("does nothing when sessionID not in spanMap", async () => {
    const { ctx, finishCalls } = makeMock()
    await handleEvent({
      type: "session.deleted",
      properties: { sessionID: "never-tracked" },
    }, ctx)

    expect(finishCalls).toHaveLength(0)
  })
})

describe("handleEvent — message.part.updated (step-finish)", () => {
  test("updates mapped span with usage from step-finish part", async () => {
    const { ctx, updateCalls, spanMap } = makeMock()
    spanMap.set("oc-sub-6", "adlr-span-6")

    await handleEvent({
      type: "message.part.updated",
      properties: {
        sessionID: "oc-sub-6",
        part: {
          type: "step-finish",
          tokens: { total: 500, input: 300, output: 200, cache: { write: 50, read: 25 } },
          cost: 0.005,
        },
      },
    }, ctx)

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].id).toBe("adlr-span-6")
    expect(updateCalls[0].data).toMatchObject({
      usage: {
        tokens: { input: 300, output: 200, cache_read: 25, cache_write: 50 },
        cost_usd: 0.005,
      },
    })
    expect(updateCalls[0].options).toEqual({ merge: true })
  })

  test("falls back to root span when sessionID not in spanMap", async () => {
    const { ctx, updateCalls } = makeMock("root-span")
    await handleEvent({
      type: "message.part.updated",
      properties: {
        sessionID: "unmapped-session",
        part: {
          type: "step-finish",
          tokens: { total: 100, input: 80, output: 20, cache: { write: 0, read: 0 } },
          cost: 0.001,
        },
      },
    }, ctx)

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].id).toBe("root-span")
  })

  test("does nothing for non-step-finish part types", async () => {
    const { ctx, updateCalls } = makeMock()
    await handleEvent({
      type: "message.part.updated",
      properties: { sessionID: "oc-sess", part: { type: "text" } },
    }, ctx)

    expect(updateCalls).toHaveLength(0)
  })

  test("defaults cache_read and cache_write to 0 when cache field is absent", async () => {
    const { ctx, updateCalls, spanMap } = makeMock()
    spanMap.set("oc-sub-7", "adlr-span-7")

    await handleEvent({
      type: "message.part.updated",
      properties: {
        sessionID: "oc-sub-7",
        part: {
          type: "step-finish",
          tokens: { total: 200, input: 150, output: 50 },
          cost: 0.002,
        },
      },
    }, ctx)

    expect(updateCalls[0].data).toMatchObject({
      usage: {
        tokens: { input: 150, output: 50, cache_read: 0, cache_write: 0 },
        cost_usd: 0.002,
      },
    })
  })
})

describe("handleEvent — session.updated", () => {
  test("updates root span with cumulative cost and tokens", async () => {
    const { ctx, updateCalls } = makeMock("root-span")
    await handleEvent({
      type: "session.updated",
      properties: {
        info: { id: "oc-root-session", cost: 0.12, tokens: { input: 5000, output: 1200 } },
      },
    }, ctx)

    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].id).toBe("root-span")
    expect(updateCalls[0].data).toMatchObject({
      usage: { cost_usd: 0.12, tokens: { input: 5000, output: 1200 } },
    })
    expect(updateCalls[0].options).toEqual({ merge: true })
  })

  test("skips update when neither cost nor tokens are present on event", async () => {
    const { ctx, updateCalls } = makeMock("root-span")
    await handleEvent({
      type: "session.updated",
      properties: { info: { id: "oc-bare" } },
    }, ctx)

    expect(updateCalls).toHaveLength(0)
  })
})

describe("handleEvent — unknown events", () => {
  test("ignores unrecognised event types without throwing", async () => {
    const { ctx } = makeMock()
    await expect(
      handleEvent({ type: "some.unknown.event", properties: {} }, ctx)
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test packages/plugins/opencode/test/handle-event.test.ts
```

Expected: FAIL — `Cannot find module '../src/handle-event'`

- [ ] **Step 3: Create `packages/plugins/opencode/src/handle-event.ts`**

```ts
import type { AgentSpanData, SpanUsage } from "@adlr/sdk"
import type { AdlrClient, OpenCodeEvent } from "./types"
import type { SpanMap } from "./span-map"
import type { RootSpanResolver } from "./root-span-resolver"

export interface PluginContext {
  client: AdlrClient
  spanMap: SpanMap
  rootResolver: RootSpanResolver
  sessionId: string
}

export async function handleEvent(
  event: OpenCodeEvent,
  ctx: PluginContext,
): Promise<void> {
  const { client, spanMap, rootResolver, sessionId } = ctx

  switch (event.type) {
    case "session.created": {
      const { id, parentID, title } = event.properties.info
      // Only track subagent sessions (those that have a parentID)
      if (!parentID) return

      const rootId = await rootResolver.resolve()

      const span = await client.span.create<"agent">({
        session_id: sessionId,
        parent_id: rootId,
        kind: "agent",
        name: title ?? id,
        status: "running",
      })

      spanMap.set(id, span.id)
      return
    }

    case "session.idle": {
      const { sessionID } = event.properties
      if (!spanMap.has(sessionID)) return

      const spanId = spanMap.get(sessionID)!
      await client.span.finish(spanId, "done")
      spanMap.markFinished(sessionID)
      return
    }

    case "session.deleted": {
      const { sessionID } = event.properties
      if (!spanMap.has(sessionID)) return
      if (spanMap.isFinished(sessionID)) return

      const spanId = spanMap.get(sessionID)!
      await client.span.finish(spanId, "done")
      spanMap.markFinished(sessionID)
      return
    }

    case "message.part.updated": {
      const { sessionID, part } = event.properties
      if (part.type !== "step-finish") return

      const stepPart = part as {
        type: "step-finish"
        tokens: { total: number; input: number; output: number; reasoning?: number; cache?: { write: number; read: number } }
        cost: number
      }

      const usage: SpanUsage = {
        tokens: {
          input: stepPart.tokens.input,
          output: stepPart.tokens.output,
          cache_read: stepPart.tokens.cache?.read ?? 0,
          cache_write: stepPart.tokens.cache?.write ?? 0,
        },
        cost_usd: stepPart.cost,
      }

      const targetId = spanMap.get(sessionID) ?? await rootResolver.resolve()

      await client.span.update<"agent">(targetId, { usage }, { merge: true })
      return
    }

    case "session.updated": {
      const { cost, tokens } = event.properties.info
      if (cost === undefined && tokens === undefined) return

      const rootId = await rootResolver.resolve()

      const usageData: Partial<SpanUsage> = {}
      if (cost !== undefined) usageData.cost_usd = cost
      if (tokens !== undefined) {
        usageData.tokens = {
          input: tokens.input ?? 0,
          output: tokens.output ?? 0,
          cache_read: tokens.cache?.read ?? 0,
          cache_write: tokens.cache?.write ?? 0,
        }
      }

      await client.span.update<"agent">(rootId, { usage: usageData }, { merge: true })
      return
    }

    default:
      // Unknown event type — no-op
      return
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test packages/plugins/opencode/test/handle-event.test.ts
```

Expected: PASS (all 15 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/opencode/src/handle-event.ts packages/plugins/opencode/test/handle-event.test.ts
git commit -m "feat(plugin-opencode): add handleEvent with full opencode event dispatch"
```

---

### Task 7: `ObservabilityPlugin` export

**Files:**
- Create: `packages/plugins/opencode/src/index.ts`
- Create: `packages/plugins/opencode/test/index.test.ts`

Wires all modules into the opencode `Plugin` export. The plugin factory reads `process.env` once at init time and delegates all event dispatch to `handleEvent`. Errors from `handleEvent` are swallowed — plugin failures must never crash the opencode process.

- [ ] **Step 1: Write the failing tests**

Create `packages/plugins/opencode/test/index.test.ts`:

```ts
import { test, expect, describe, afterEach } from "bun:test"
import { ObservabilityPlugin } from "../src/index"

describe("ObservabilityPlugin", () => {
  afterEach(() => {
    for (const key of ["ADLR_SPAN_ID", "ADLR_SESSION", "ADLR_SOCKET"]) {
      delete process.env[key]
    }
  })

  test("is a function (plugin factory)", () => {
    expect(typeof ObservabilityPlugin).toBe("function")
  })

  test("standalone mode — returns object with event hook (no env vars)", async () => {
    delete process.env.ADLR_SPAN_ID
    delete process.env.ADLR_SESSION
    delete process.env.ADLR_SOCKET

    const plugin = await ObservabilityPlugin({} as any)
    expect(plugin).toBeObject()
    expect(typeof plugin.event).toBe("function")
  })

  test("standalone mode — event hook is a no-op and resolves without throwing", async () => {
    delete process.env.ADLR_SPAN_ID
    delete process.env.ADLR_SESSION
    delete process.env.ADLR_SOCKET

    const plugin = await ObservabilityPlugin({} as any)
    await expect(
      plugin.event!({
        event: {
          type: "session.created",
          properties: { info: { id: "x", parentID: "y" } },
        } as any,
      })
    ).resolves.toBeUndefined()
  })

  test("managed mode — plugin resolves to object with event hook", async () => {
    process.env.ADLR_SPAN_ID = "span-123"
    process.env.ADLR_SESSION = "sess-123"
    process.env.ADLR_SOCKET = "/tmp/nonexistent-adlr-managed.sock"

    const plugin = await ObservabilityPlugin({} as any)
    expect(typeof plugin.event).toBe("function")
  })

  test("session-attached mode — plugin resolves to object with event hook", async () => {
    delete process.env.ADLR_SPAN_ID
    process.env.ADLR_SESSION = "sess-456"
    process.env.ADLR_SOCKET = "/tmp/nonexistent-adlr-attached.sock"

    const plugin = await ObservabilityPlugin({} as any)
    expect(typeof plugin.event).toBe("function")
  })

  test("event hook swallows handleEvent errors — never propagates to opencode", async () => {
    delete process.env.ADLR_SPAN_ID
    delete process.env.ADLR_SESSION
    delete process.env.ADLR_SOCKET

    const plugin = await ObservabilityPlugin({} as any)
    // Passing null triggers a type error inside handleEvent — must not throw
    await expect(
      plugin.event!({ event: null as any })
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test packages/plugins/opencode/test/index.test.ts
```

Expected: FAIL — `Cannot find module '../src/index'`

- [ ] **Step 3: Create `packages/plugins/opencode/src/index.ts`**

```ts
import { createClient } from "@adlr/sdk"
import type { Plugin } from "@opencode-ai/plugin"
import { handleEvent } from "./handle-event"
import { resolveMode } from "./resolve-mode"
import { RootSpanResolver } from "./root-span-resolver"
import { SpanMap } from "./span-map"

export const ObservabilityPlugin: Plugin = async () => {
  const pluginMode = resolveMode(process.env as Record<string, string | undefined>)
  if (pluginMode.mode === "standalone") return {}

  const client = createClient(pluginMode.socketPath)
  const spanMap = new SpanMap()
  const rootSpanResolver = new RootSpanResolver(
    pluginMode.sessionId,
    client as any,
    pluginMode.mode === "managed" ? pluginMode.spanId : undefined,
  )

  return {
    event: async ({ event }: { event: unknown }) => {
      await handleEvent(event as any, {
        client: client as any,
        sessionId: pluginMode.sessionId,
        rootSpanResolver,
        spanMap,
      })
    },
  }
}
```

- [ ] **Step 4: Run `bun test packages/plugins/opencode` — all pass**

```bash
bun test packages/plugins/opencode
```

Expected: all test files pass with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/plugins/opencode/src/index.ts packages/plugins/opencode/test/index.test.ts
git commit -m "feat(plugin-opencode): add ObservabilityPlugin factory export"
```

---

### Task 8: Final verification

**Files:** No new files.

- [ ] **Step 1: `bun test packages/plugins/opencode`**

```bash
bun test packages/plugins/opencode
```

Expected: all tests pass.

- [ ] **Step 2: `bun typecheck` for the plugin package**

```bash
bun typecheck --filter='packages/plugins/opencode'
```

Expected: no type errors. Common issues:
- `@opencode-ai/plugin` not found: verify it is in `devDependencies` and `bun install` was run.
- `@adlr/sdk` types missing `AgentSpanData` / `SpanUsage`: these are added by the sdk-refactor plan — confirm that plan is merged first.
- Type mismatch on `span.create<K>` / `span.update<K>`: confirm the generic overloads from the sdk-refactor plan are in place.

- [ ] **Step 3: `bun lint` for the plugin package**

```bash
bun lint --filter='packages/plugins/opencode'
```

Expected: no lint errors. Fix any Biome warnings (trailing commas, unused imports) and re-run.

- [ ] **Step 4: Full workspace test suite**

```bash
bun test
```

Expected: all tests pass across all packages, including the new plugin.
