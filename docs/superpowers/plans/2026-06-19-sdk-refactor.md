# SDK Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple `SQLiteStorage` from `@adlr/sdk`, add a typed span hierarchy with `AgentSpanData`, and extend the `Client` interface with generic `span.create`, `span.finish`, `span.get`, and `span.update` methods.

**Architecture:** The SDK becomes a pure-types + client package: `SQLiteStorage` moves exclusively to the daemon (it already lives there too), typed spans give callers compile-time safety over `data` payloads without runtime overhead, and the client gains two new IPC calls (`span.create`, `span.finish`) plus generic overloads on the existing `span.get` and `span.update`.

**Tech Stack:** TypeScript (tsgo / `@typescript/native-preview`), Bun runtime, `bun:test`, `bun:sqlite` (daemon-only after this refactor).

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Delete | `packages/sdk/src/sqlite-storage.ts` | SQLite implementation — moves to daemon |
| Delete | `packages/sdk/test/storage.test.ts` | Tests for the deleted file |
| Modify | `packages/sdk/src/index.ts` | Remove `sqlite-storage` re-export |
| Modify | `packages/sdk/src/types.ts` | Add `SpanUsage`, `AgentSpanData`, `SpanDataMap`, `BaseSpan`, `AgentSpan`, `SpanOf<K>`, updated `CreateSpanInput<K>` |
| Create | `packages/sdk/test/types.test.ts` | Type-level and runtime tests for new span types |
| Modify | `packages/sdk/src/storage.ts` | `updateSpan` uses `Partial<BaseSpan>` |
| Modify | `packages/sdk/src/client.ts` | Add `span.create<K>`, `span.finish`, make `span.get<K>` and `span.update<K>` generic |
| Modify | `packages/sdk/test/client.test.ts` | Tests for the four new/updated span client methods |

---

## Task 1: Remove `SqliteStorage` from SDK

**Files:**
- Delete: `packages/sdk/src/sqlite-storage.ts`
- Delete: `packages/sdk/test/storage.test.ts`
- Modify: `packages/sdk/src/index.ts`

- [ ] **Step 1: Delete the SQLite storage source file**

```bash
rm packages/sdk/src/sqlite-storage.ts
```

- [ ] **Step 2: Delete the storage test file**

```bash
rm packages/sdk/test/storage.test.ts
```

- [ ] **Step 3: Update `packages/sdk/src/index.ts` to remove the `sqlite-storage` export**

Replace the entire file with:

```ts
export { type Client, createClient, type IpcMessage } from "./client";
export * from "./constants";
export * from "./paths";
export * from "./storage";
export * from "./types";
```

- [ ] **Step 4: Run tests to confirm nothing is broken**

```bash
bun test packages/sdk
```

Expected: all remaining tests pass (the deleted `storage.test.ts` is gone, so the `SQLiteStorage` import error no longer exists).

- [ ] **Step 5: Typecheck**

```bash
bun typecheck --filter='./packages/sdk'
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/sqlite-storage.ts packages/sdk/test/storage.test.ts packages/sdk/src/index.ts
git commit -m "refactor(sdk): remove SQLiteStorage — moves to daemon"
```

---

## Task 2: Add typed span hierarchy to `types.ts`

**Files:**
- Modify: `packages/sdk/src/types.ts`
- Create: `packages/sdk/test/types.test.ts`

### Background

Currently `Span.data` is `Record<string, unknown>` for every span kind. We introduce:

- `SpanUsage` — token/cost accounting
- `AgentSpanData` — well-known fields for `kind: "agent"` spans
- `SpanDataMap` — maps every `SpanKind` to its data shape
- `BaseSpan` — the existing `Span` interface renamed (keeps `data: Record<string,unknown>`)
- `AgentSpan` — override of `BaseSpan` with `kind: "agent"` and `data: AgentSpanData`
- `SpanOf<K>` — conditional type returning `AgentSpan` for `"agent"`, `BaseSpan` otherwise
- `Span` — union `AgentSpan | BaseSpan` (replaces the old flat `Span`)
- `CreateSpanInput<K>` — generic version parameterised on `K extends SpanKind`

- [ ] **Step 1: Write the failing test**

Create `packages/sdk/test/types.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type {
  AgentSpan,
  AgentSpanData,
  BaseSpan,
  CreateSpanInput,
  Span,
  SpanDataMap,
  SpanOf,
  SpanUsage,
} from "../src/types";

describe("SpanUsage shape", () => {
  test("accepts valid usage object", () => {
    const usage: SpanUsage = {
      tokens: { input: 10, output: 20, cache_read: 0, cache_write: 0 },
      cost_usd: 0.001,
    };
    expect(usage.cost_usd).toBe(0.001);
    expect(usage.tokens.input).toBe(10);
  });

  test("accepts optional model_id and provider_id", () => {
    const usage: SpanUsage = {
      tokens: { input: 1, output: 2, cache_read: 0, cache_write: 0 },
      cost_usd: 0,
      model_id: "gpt-4o",
      provider_id: "openai",
    };
    expect(usage.model_id).toBe("gpt-4o");
    expect(usage.provider_id).toBe("openai");
  });
});

describe("AgentSpanData shape", () => {
  test("all fields are optional", () => {
    const data: AgentSpanData = {};
    expect(data).toEqual({});
  });

  test("accepts all known fields", () => {
    const data: AgentSpanData = {
      prompt: "do the thing",
      agent_type: "opencode",
      pid: 12345,
      exit_code: 0,
      output: "done",
      usage: {
        tokens: { input: 5, output: 10, cache_read: 0, cache_write: 0 },
        cost_usd: 0.002,
      },
    };
    expect(data.prompt).toBe("do the thing");
    expect(data.pid).toBe(12345);
    expect(data.usage?.cost_usd).toBe(0.002);
  });

  test("pid and exit_code accept null", () => {
    const data: AgentSpanData = { pid: null, exit_code: null };
    expect(data.pid).toBeNull();
    expect(data.exit_code).toBeNull();
  });
});

describe("SpanDataMap", () => {
  test("agent key maps to AgentSpanData", () => {
    // Structural check: assign AgentSpanData to SpanDataMap["agent"]
    const d: SpanDataMap["agent"] = { prompt: "hello" };
    expect(d.prompt).toBe("hello");
  });

  test("other keys map to Record<string,unknown>", () => {
    const d: SpanDataMap["workflow"] = { custom: true };
    expect(d.custom).toBe(true);
    const s: SpanDataMap["step"] = {};
    expect(s).toEqual({});
    const h: SpanDataMap["hook"] = { event: "post-commit" };
    expect(h.event).toBe("post-commit");
  });
});

describe("BaseSpan shape", () => {
  test("has all required fields", () => {
    const span: BaseSpan = {
      id: "s1",
      session_id: "sess-1",
      parent_id: null,
      kind: "workflow",
      name: "my-workflow",
      status: "running",
      started_at: 1000,
      finished_at: null,
      data: {},
    };
    expect(span.kind).toBe("workflow");
    expect(span.data).toEqual({});
  });
});

describe("AgentSpan shape", () => {
  test("kind is literally 'agent' and data is AgentSpanData", () => {
    const span: AgentSpan = {
      id: "s2",
      session_id: "sess-1",
      parent_id: null,
      kind: "agent",
      name: "my-agent",
      status: "running",
      started_at: 1000,
      finished_at: null,
      data: { prompt: "run", pid: 42 },
    };
    expect(span.kind).toBe("agent");
    expect(span.data.prompt).toBe("run");
    expect(span.data.pid).toBe(42);
  });
});

describe("SpanOf<K> conditional type", () => {
  test("SpanOf<'agent'> is AgentSpan at runtime via cast", () => {
    const span: SpanOf<"agent"> = {
      id: "s3",
      session_id: "sess-1",
      parent_id: null,
      kind: "agent",
      name: "test",
      status: "done",
      started_at: 0,
      finished_at: 1,
      data: { exit_code: 0 },
    };
    expect(span.data.exit_code).toBe(0);
  });

  test("SpanOf<'step'> is BaseSpan", () => {
    const span: SpanOf<"step"> = {
      id: "s4",
      session_id: "sess-1",
      parent_id: null,
      kind: "step",
      name: "test-step",
      status: "done",
      started_at: 0,
      finished_at: 1,
      data: { custom: "value" },
    };
    expect(span.data.custom).toBe("value");
  });
});

describe("Span union type", () => {
  test("can hold an AgentSpan", () => {
    const span: Span = {
      id: "s5",
      session_id: "sess-1",
      parent_id: null,
      kind: "agent",
      name: "union-agent",
      status: "pending",
      started_at: 0,
      finished_at: null,
      data: {},
    };
    expect(span.kind).toBe("agent");
  });

  test("can hold a BaseSpan", () => {
    const span: Span = {
      id: "s6",
      session_id: "sess-1",
      parent_id: null,
      kind: "hook",
      name: "union-hook",
      status: "pending",
      started_at: 0,
      finished_at: null,
      data: { event: "pre-push" },
    };
    expect(span.kind).toBe("hook");
  });
});

describe("CreateSpanInput<K> generic", () => {
  test("non-generic call still works", () => {
    const input: CreateSpanInput = {
      session_id: "sess-1",
      kind: "step",
      name: "my-step",
    };
    expect(input.kind).toBe("step");
  });

  test("agent-specialised input accepts AgentSpanData", () => {
    const input: CreateSpanInput<"agent"> = {
      session_id: "sess-1",
      kind: "agent",
      name: "my-agent",
      data: { prompt: "hello", agent_type: "opencode" },
    };
    expect(input.data?.prompt).toBe("hello");
  });

  test("non-agent input accepts Record<string,unknown> data", () => {
    const input: CreateSpanInput<"workflow"> = {
      session_id: "sess-1",
      kind: "workflow",
      name: "my-workflow",
      data: { steps: 3 },
    };
    expect(input.data?.steps).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
bun test packages/sdk/test/types.test.ts
```

Expected: compilation errors — `BaseSpan`, `AgentSpan`, `SpanUsage`, `SpanDataMap`, `SpanOf`, `AgentSpanData` are not yet exported.

- [ ] **Step 3: Update `packages/sdk/src/types.ts`**

Replace the entire file with:

```ts
export type SessionStatus = "active" | "completed" | "archived";

export interface Session {
	id: string;
	status: SessionStatus;
	working_dir: string;
	created_at: number;
}

export type CreateSessionInput = {
	status?: SessionStatus;
	working_dir: string;
};

export type SpanKind = "agent" | "workflow" | "step" | "hook";
export type SpanStatus = "pending" | "running" | "done" | "failed" | "blocked";

// ── Typed span data ───────────────────────────────────────────────────────────

export interface SpanUsage {
	tokens: {
		input: number;
		output: number;
		cache_read: number;
		cache_write: number;
	};
	cost_usd: number;
	model_id?: string;
	provider_id?: string;
}

export interface AgentSpanData {
	prompt?: string;
	agent_type?: string;
	pid?: number | null;
	exit_code?: number | null;
	output?: string;
	usage?: SpanUsage;
}

export type SpanDataMap = {
	agent: AgentSpanData;
	workflow: Record<string, unknown>;
	step: Record<string, unknown>;
	hook: Record<string, unknown>;
};

// ── Span interfaces ───────────────────────────────────────────────────────────

export interface BaseSpan {
	id: string;
	session_id: string;
	parent_id: string | null;
	kind: SpanKind;
	name: string;
	status: SpanStatus;
	started_at: number;
	finished_at: number | null;
	data: Record<string, unknown>;
}

export interface AgentSpan extends Omit<BaseSpan, "kind" | "data"> {
	kind: "agent";
	data: AgentSpanData;
}

export type SpanOf<K extends SpanKind> = K extends "agent" ? AgentSpan : BaseSpan;

export type Span = AgentSpan | BaseSpan;

export type CreateSpanInput<K extends SpanKind = SpanKind> = {
	session_id: string;
	parent_id?: string | null;
	kind: K;
	name: string;
	status?: SpanStatus;
	data?: K extends "agent" ? AgentSpanData : Record<string, unknown>;
};

// ── Events ────────────────────────────────────────────────────────────────────

export type EventType =
	| "span.started"
	| "span.finished"
	| "span.failed"
	| "log.info"
	| "log.warn"
	| "log.error"
	| "context.added"
	| "session.created";

export interface Event {
	id: number;
	session_id: string;
	span_id: string | null;
	type: EventType;
	data: Record<string, unknown>;
	timestamp: number;
}

export type CreateEventInput = {
	session_id: string;
	span_id?: string | null;
	type: EventType;
	data?: Record<string, unknown>;
	timestamp?: number;
};

// ── Context ───────────────────────────────────────────────────────────────────

export type ContextItemType = "goal" | "url" | "file" | "text";

export interface ContextItem {
	id: string;
	session_id: string;
	type: ContextItemType;
	label: string | null;
	description: string | null;
	value: Record<string, unknown>;
	created_at: number;
}

export type AddContextItemInput = {
	session_id: string;
	type: ContextItemType;
	label?: string | null;
	description?: string | null;
	value: Record<string, unknown>;
};

export type EventFilter = {
	type?: EventType;
	span_id?: string;
};

export type ContextFilter = {
	type?: ContextItemType;
	label?: string;
};

// ── TUI / config types ────────────────────────────────────────────────────────

export type ContentNode = LayoutNode | PanelNode | string;

export interface LayoutNode {
	layout: string;
	content: ContentNode[];
	[key: string]: unknown;
}

export interface PanelNode {
	panel: string;
}

export interface TuiConfig {
	layout?: LayoutNode;
}

export interface AdlrConfig {
	agent?: {
		agents?: Record<string, AgentConfig>;
		attach?: AttachConfig;
	};
	tui?: TuiConfig;
}

export interface AgentConfig {
	run?: (ctx: { prompt: string; subagent?: string }) => string;
	open?: (ctx: { span: Span; proc: ProcContext; $: unknown }) => string;
	output?: (ctx: {
		span: Span;
		proc: ProcContext;
		$: unknown;
	}) => Promise<
		{ type: "text"; content: string } | { type: "file"; path: string }
	>;
	status?: (ctx: {
		span: Span;
		currentStatus: SpanStatus;
		proc: ProcContext;
		$: unknown;
	}) => Promise<"working" | "completed" | "failed" | "blocked">;
	statusPollInterval?: number;
	mode?: "tui" | "log";
	interactive?: boolean;
	interactiveTimeout?: number;
}

export interface ProcContext {
	stdoutIdle: boolean;
	lastStdout: string;
}

export type AttachConfig = (ctx: {
	agentId: string;
	readCmd: string;
	openCmd?: string;
}) => string;
```

- [ ] **Step 4: Run the types test and confirm it passes**

```bash
bun test packages/sdk/test/types.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run all SDK tests**

```bash
bun test packages/sdk
```

Expected: all tests pass.

- [ ] **Step 6: Typecheck**

```bash
bun typecheck --filter='./packages/sdk'
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/types.ts packages/sdk/test/types.test.ts
git commit -m "feat(sdk): add typed span hierarchy — BaseSpan, AgentSpan, SpanOf, SpanDataMap"
```

---

## Task 3: Update `storage.ts` — `updateSpan` uses `Partial<BaseSpan>`

**Files:**
- Modify: `packages/sdk/src/storage.ts`

The `Storage` interface's `updateSpan` signature currently accepts `Partial<Span>`. Now that `Span` is a union type (`AgentSpan | BaseSpan`), `Partial<Span>` becomes the intersection of their optional keys, which is too restrictive. We want `Partial<BaseSpan>` — the full set of span fields — because the storage layer works with raw rows and doesn't need kind-specialised types.

- [ ] **Step 1: Update `packages/sdk/src/storage.ts`**

Replace the entire file with:

```ts
import type {
	AddContextItemInput,
	BaseSpan,
	ContextFilter,
	ContextItem,
	CreateEventInput,
	CreateSessionInput,
	CreateSpanInput,
	Event,
	EventFilter,
	Session,
	Span,
} from "./types";

export interface Storage {
	createSession(data: CreateSessionInput): Promise<Session>;
	getSession(id: string): Promise<Session | null>;
	listSessions(): Promise<Session[]>;
	updateSession(id: string, data: Partial<Session>): Promise<void>;

	createSpan(data: CreateSpanInput): Promise<Span>;
	updateSpan(id: string, data: Partial<BaseSpan>): Promise<void>;
	getSpan(id: string): Promise<Span | null>;
	listSpans(sessionId: string): Promise<Span[]>;
	listAllSpans(): Promise<Span[]>;

	createEvent(data: CreateEventInput): Promise<Event>;
	listEvents(sessionId: string, filter?: EventFilter): Promise<Event[]>;

	addContextItem(data: AddContextItemInput): Promise<ContextItem>;
	listContextItems(
		sessionId: string,
		filter?: ContextFilter,
	): Promise<ContextItem[]>;

	close(): void;
}
```

- [ ] **Step 2: Run all SDK tests**

```bash
bun test packages/sdk
```

Expected: all tests pass.

- [ ] **Step 3: Typecheck**

```bash
bun typecheck --filter='./packages/sdk'
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/storage.ts
git commit -m "refactor(sdk): updateSpan uses Partial<BaseSpan> instead of Partial<Span>"
```

---

## Task 4: Update `client.ts` — generic span methods + new `span.create` / `span.finish`

**Files:**
- Modify: `packages/sdk/src/client.ts`
- Modify: `packages/sdk/test/client.test.ts`

### New methods

| Method | IPC message type | Notes |
|--------|-----------------|-------|
| `span.create<K>(input)` | `"span.create"` | Returns `SpanOf<K>` |
| `span.finish(id, status?)` | `"span.finish"` | Status defaults to `"done"` if omitted |
| `span.get<K>(id)` | `"span.get"` | Was already there, now returns `SpanOf<K>` |
| `span.update<K>(id, data, options?)` | `"span.update"` | `data` is now `Partial<SpanDataMap[K]>` |

- [ ] **Step 1: Write the failing tests**

Add the following block to the bottom of `packages/sdk/test/client.test.ts`, inside the `describe("Client", ...)` block (before the closing `}`):

```ts
  test("span.create sends span.create and returns SpanOf<K>", async () => {
    const client = createClient(FAKE_SOCK);
    const socket = await waitForSocket();

    let receivedMsg: unknown;
    const originalHandler = socket.listeners("data")[0] as (d: Buffer) => void;
    socket.removeListener("data", originalHandler);
    socket.on("data", (data) => {
      for (const line of data.toString().trim().split("\n")) {
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          receivedMsg = msg;
          socket.write(
            `${JSON.stringify({
              type: "response",
              id: msg.id,
              payload: {
                id: "span-new",
                session_id: "sess-1",
                parent_id: null,
                kind: "agent",
                name: "my-agent",
                status: "pending",
                started_at: 0,
                finished_at: null,
                data: { prompt: "hello" },
              },
            })}\n`,
          );
        } catch {
          // ignore
        }
      }
    });

    const span = await client.span.create<"agent">({
      session_id: "sess-1",
      kind: "agent",
      name: "my-agent",
      data: { prompt: "hello" },
    });

    expect(span.id).toBe("span-new");
    expect(span.kind).toBe("agent");
    expect((receivedMsg as { type: string }).type).toBe("span.create");

    client.close();
  });

  test("span.finish sends span.finish with id and status", async () => {
    const client = createClient(FAKE_SOCK);
    const socket = await waitForSocket();

    let receivedPayload: unknown;
    const originalHandler = socket.listeners("data")[0] as (d: Buffer) => void;
    socket.removeListener("data", originalHandler);
    socket.on("data", (data) => {
      for (const line of data.toString().trim().split("\n")) {
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          receivedPayload = msg.payload;
          socket.write(
            `${JSON.stringify({ type: "response", id: msg.id, payload: null })}\n`,
          );
        } catch {
          // ignore
        }
      }
    });

    await client.span.finish("span-abc", "failed");
    expect((receivedPayload as { id: string; status: string }).id).toBe("span-abc");
    expect((receivedPayload as { id: string; status: string }).status).toBe("failed");

    client.close();
  });

  test("span.finish defaults status to 'done'", async () => {
    const client = createClient(FAKE_SOCK);
    const socket = await waitForSocket();

    let receivedPayload: unknown;
    const originalHandler = socket.listeners("data")[0] as (d: Buffer) => void;
    socket.removeListener("data", originalHandler);
    socket.on("data", (data) => {
      for (const line of data.toString().trim().split("\n")) {
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          receivedPayload = msg.payload;
          socket.write(
            `${JSON.stringify({ type: "response", id: msg.id, payload: null })}\n`,
          );
        } catch {
          // ignore
        }
      }
    });

    await client.span.finish("span-xyz");
    expect((receivedPayload as { status: string }).status).toBe("done");

    client.close();
  });

  test("span.get<K> returns SpanOf<K>", async () => {
    const client = createClient(FAKE_SOCK);
    const socket = await waitForSocket();

    const originalHandler = socket.listeners("data")[0] as (d: Buffer) => void;
    socket.removeListener("data", originalHandler);
    socket.on("data", (data) => {
      for (const line of data.toString().trim().split("\n")) {
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          socket.write(
            `${JSON.stringify({
              type: "response",
              id: msg.id,
              payload: {
                id: "span-get-1",
                session_id: "sess-1",
                parent_id: null,
                kind: "agent",
                name: "fetched",
                status: "done",
                started_at: 0,
                finished_at: 1,
                data: { exit_code: 0 },
              },
            })}\n`,
          );
        } catch {
          // ignore
        }
      }
    });

    const span = await client.span.get<"agent">("span-get-1");
    expect(span.id).toBe("span-get-1");
    expect(span.data.exit_code).toBe(0);

    client.close();
  });

  test("span.update<K> sends span.update with typed data", async () => {
    const client = createClient(FAKE_SOCK);
    const socket = await waitForSocket();

    let receivedPayload: unknown;
    const originalHandler = socket.listeners("data")[0] as (d: Buffer) => void;
    socket.removeListener("data", originalHandler);
    socket.on("data", (data) => {
      for (const line of data.toString().trim().split("\n")) {
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          receivedPayload = msg.payload;
          socket.write(
            `${JSON.stringify({ type: "response", id: msg.id, payload: null })}\n`,
          );
        } catch {
          // ignore
        }
      }
    });

    await client.span.update<"agent">("span-1", { exit_code: 0, output: "done" }, { merge: true });
    const p = receivedPayload as { id: string; data: unknown; options: unknown };
    expect(p.id).toBe("span-1");
    expect(p.data).toEqual({ exit_code: 0, output: "done" });
    expect(p.options).toEqual({ merge: true });

    client.close();
  });

  test("client has span.create and span.finish methods", () => {
    const client = createClient(FAKE_SOCK);
    expect(client.span.create).toBeFunction();
    expect(client.span.finish).toBeFunction();
    client.close();
  });
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
bun test packages/sdk/test/client.test.ts
```

Expected: failures on `span.create`, `span.finish`, `span.get<K>` (wrong return type), and `span.update<K>` (wrong data type).

- [ ] **Step 3: Update `packages/sdk/src/client.ts`**

Replace the entire file with:

```ts
import { connect } from "node:net";
import { getSocketPath } from "./paths";
import type {
	AddContextItemInput,
	ContextItem,
	CreateSessionInput,
	CreateSpanInput,
	Event,
	Session,
	SpanDataMap,
	SpanKind,
	SpanOf,
	SpanStatus,
} from "./types";

export type IpcMessage =
	| { type: "response"; id: string; payload: unknown }
	| { type: "error"; id: string; error: string }
	| {
			type: "snapshot";
			payload: {
				session: Session;
				spans: SpanOf<SpanKind>[];
				events: Event[];
				context: ContextItem[];
			};
	  }
	| { type: "event"; event: string; payload: unknown };

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
};

export interface Client {
	env(): {
		sessionId: string | undefined;
		spanId: string | undefined;
		socketPath: string;
	};
	session: {
		create(data?: CreateSessionInput): Promise<Session>;
		list(): Promise<Session[]>;
	};
	agent: {
		run(data: {
			sessionId: string;
			agentType: string;
			prompt: string;
			name?: string;
			parentSpanId?: string;
		}): Promise<SpanOf<"agent">>;
		wait(data: { name: string } | { id: string }): Promise<SpanOf<SpanKind>>;
		status(data: { name: string } | { id: string }): Promise<SpanStatus>;
		list(): Promise<SpanOf<SpanKind>[]>;
		attach(nameOrId: string): Promise<void>;
	};
	span: {
		create<K extends SpanKind>(input: CreateSpanInput<K>): Promise<SpanOf<K>>;
		finish(id: string, status?: "done" | "failed"): Promise<void>;
		get<K extends SpanKind = SpanKind>(id: string): Promise<SpanOf<K>>;
		list(sessionId: string): Promise<SpanOf<SpanKind>[]>;
		update<K extends SpanKind = SpanKind>(
			id: string,
			data: Partial<SpanDataMap[K]>,
			options?: { merge?: boolean },
		): Promise<void>;
	};
	context: {
		add(data: AddContextItemInput): Promise<ContextItem>;
		list(): Promise<ContextItem[]>;
	};
	subscribe(
		sessionId: string,
		handler: (event: IpcMessage) => void,
	): Promise<() => void>;
	on(event: string, handler: (event: unknown) => void): () => void;
	close(): void;
}

export function createClient(socketPath: string = getSocketPath()): Client {
	const socket = connect(socketPath);
	const pending = new Map<string, PendingRequest>();
	let eventHandlers: Array<{
		event: string;
		handler: (event: unknown) => void;
	}> = [];
	let closed = false;
	let reqId = 0;

	function nextId(): string {
		return `req-${++reqId}`;
	}

	function ensureConnection(): Promise<void> {
		if (socket.readyState === "open") return Promise.resolve();
		return new Promise((resolve, reject) => {
			const onOpen = () => {
				cleanup();
				resolve();
			};
			const onError = (err: Error) => {
				cleanup();
				reject(err);
			};
			const cleanup = () => {
				socket.removeListener("connect", onOpen);
				socket.removeListener("error", onError);
			};
			socket.once("connect", onOpen);
			socket.once("error", onError);
		});
	}

	function toSnakeCase(value: unknown): unknown {
		if (Array.isArray(value)) {
			return value.map(toSnakeCase);
		}
		if (value !== null && typeof value === "object") {
			const result: Record<string, unknown> = {};
			for (const [key, val] of Object.entries(value)) {
				const snakeKey = key
					.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
					.replace(/([a-z\d])([A-Z])/g, "$1_$2")
					.toLowerCase();
				result[snakeKey] = toSnakeCase(val);
			}
			return result;
		}
		return value;
	}

	function send<T>(type: string, payload: unknown): Promise<T> {
		if (closed) return Promise.reject(new Error("Client is closed"));
		const id = nextId();
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
			ensureConnection()
				.then(() => {
					socket.write(
						`${JSON.stringify({ type, id, payload: toSnakeCase(payload) })}\n`,
					);
				})
				.catch(reject);
		});
	}

	let buffer = "";
	socket.on("data", (data) => {
		buffer += data.toString();
		const lines = buffer.split("\n");
		// Last element is either "" (if buffer ended with \n) or an incomplete line.
		// Either way, keep it as the new buffer and process everything before it.
		buffer = lines[lines.length - 1] ?? "";
		for (const line of lines.slice(0, -1)) {
			if (!line) continue;
			try {
				const msg = JSON.parse(line) as IpcMessage;
				if (msg.type === "response" || msg.type === "error") {
					const req = pending.get(msg.id);
					if (req) {
						pending.delete(msg.id);
						if (msg.type === "error") req.reject(new Error(msg.error));
						else req.resolve(msg.payload);
					}
				} else {
					for (const h of eventHandlers) {
						if (h.event === "*" || h.event === msg.type) {
							h.handler(msg);
						}
					}
				}
			} catch (_e) {
				// ignore malformed lines
			}
		}
	});

	socket.on("error", (err) => {
		for (const [, req] of pending) {
			req.reject(err);
		}
		pending.clear();
	});

	socket.on("close", () => {
		closed = true;
		for (const [, req] of pending) {
			req.reject(new Error("Socket closed"));
		}
		pending.clear();
	});

	const client: Client = {
		env() {
			return {
				sessionId: process.env.ADLR_SESSION,
				spanId: process.env.ADLR_SPAN_ID,
				socketPath: process.env.ADLR_SOCKET ?? getSocketPath(),
			};
		},
		session: {
			create: (data) => send("session.create", data),
			list: () => send("session.list", {}),
		},
		agent: {
			run: (data) => send("agent.run", data),
			wait: (data) => send("agent.wait", data),
			status: (data) => send("agent.status", data),
			list: () => send("agent.list", {}),
			attach: (nameOrId) => send("agent.attach", { span_id: nameOrId }),
		},
		span: {
			create: <K extends SpanKind>(input: CreateSpanInput<K>) =>
				send<SpanOf<K>>("span.create", input),
			finish: (id, status = "done") =>
				send("span.finish", { id, status }),
			get: <K extends SpanKind = SpanKind>(id: string) =>
				send<SpanOf<K>>("span.get", { id }),
			list: (sessionId) => send("span.list", { session_id: sessionId }),
			update: <K extends SpanKind = SpanKind>(
				id: string,
				data: Partial<SpanDataMap[K]>,
				options?: { merge?: boolean },
			) => send("span.update", { id, data, options }),
		},
		context: {
			add: (data) => send("context.add", data),
			list: () => send("context.list", {}),
		},
		async subscribe(sessionId, handler) {
			const wrapped = (msg: unknown) => handler(msg as IpcMessage);
			const entry = { event: "*", handler: wrapped };
			eventHandlers.push(entry);
			try {
				const snapshot = await send("subscribe", { session_id: sessionId });
				if (
					snapshot &&
					typeof snapshot === "object" &&
					"type" in (snapshot as object) &&
					(snapshot as IpcMessage).type === "snapshot"
				) {
					wrapped(snapshot);
				}
			} catch (err) {
				eventHandlers = eventHandlers.filter((h) => h !== entry);
				throw err;
			}
			return () => {
				eventHandlers = eventHandlers.filter((h) => h !== entry);
			};
		},
		on(event, handler) {
			const entry = { event, handler };
			eventHandlers.push(entry);
			return () => {
				eventHandlers = eventHandlers.filter((h) => h !== entry);
			};
		},
		close() {
			closed = true;
			socket.end();
		},
	};

	return client;
}
```

- [ ] **Step 4: Run all SDK tests**

```bash
bun test packages/sdk
```

Expected: all tests pass, including the new `span.create`, `span.finish`, `span.get<K>`, and `span.update<K>` tests.

- [ ] **Step 5: Typecheck**

```bash
bun typecheck --filter='./packages/sdk'
```

Expected: no errors.

- [ ] **Step 6: Run lint**

```bash
bun lint --filter='./packages/sdk'
```

Expected: no errors or warnings.

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/client.ts packages/sdk/test/client.test.ts
git commit -m "feat(sdk): generic span.create/finish/get/update on Client"
```
