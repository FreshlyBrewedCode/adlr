# Daemon Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Dependency:** This plan must be executed **after** `docs/superpowers/plans/2026-06-19-sdk-refactor.md` completes.

**Goal:** Add `span.create` and `span.finish` command handlers to the daemon and update all daemon imports to consume `SQLiteStorage` from its new local path.

**Architecture:** The daemon already has a `handleCommand()` switch in `handlers.ts`. The two new cases follow the same pattern as existing handlers. The `SQLiteStorage` import relocation is a pure path swap.

**Tech Stack:** Bun, TypeScript, bun:test, bun:sqlite

**Spec reference:** `docs/superpowers/specs/2026-06-19-opencode-observability-design.md`

---

## File Map

| File | Change |
|---|---|
| `packages/daemon/src/index.ts` | Split `@adlr/sdk` import — `SQLiteStorage` moves to `./sqlite-storage` |
| `packages/daemon/src/handlers.ts` | Add `span.create` and `span.finish` cases; add `SpanKind`/`SpanStatus` to SDK import |
| `packages/daemon/test/server.test.ts` | Update `SQLiteStorage` import to `../src/sqlite-storage` |
| `packages/daemon/test/process-manager.test.ts` | Update `SQLiteStorage` import to `../src/sqlite-storage` |
| `packages/daemon/test/handlers.test.ts` | **Create** — failing tests for `span.create` and `span.finish` |

---

### Task 1: Update SQLiteStorage imports from `@adlr/sdk` → `./sqlite-storage`

**Gate:** `packages/daemon/src/sqlite-storage.ts` must exist. If it does not, the SDK refactor plan has not run — stop and run that plan first.

**Files:**
- Modify: `packages/daemon/src/index.ts`
- Modify: `packages/daemon/test/server.test.ts`
- Modify: `packages/daemon/test/process-manager.test.ts`

- [ ] **Step 1: Verify the gate file exists**

```bash
ls packages/daemon/src/sqlite-storage.ts
```

Expected: the file is listed. If you get "No such file or directory", stop — run the SDK refactor plan first.

- [ ] **Step 2: Update `packages/daemon/src/index.ts`**

Current line 1:
```ts
import { getDbPath, SQLiteStorage } from "@adlr/sdk";
```

Replace with:
```ts
import { getDbPath } from "@adlr/sdk";
import { SQLiteStorage } from "./sqlite-storage";
```

No other changes to this file.

- [ ] **Step 3: Update `packages/daemon/test/server.test.ts`**

Current line 12:
```ts
import { SQLiteStorage } from "@adlr/sdk";
```

Replace with:
```ts
import { SQLiteStorage } from "../src/sqlite-storage";
```

No other changes to this file.

- [ ] **Step 4: Update `packages/daemon/test/process-manager.test.ts`**

Current line 5:
```ts
import { SQLiteStorage } from "@adlr/sdk";
```

Replace with:
```ts
import { SQLiteStorage } from "../src/sqlite-storage";
```

No other changes to this file.

- [ ] **Step 5: Run daemon tests to confirm all pass**

```bash
bun test packages/daemon
```

Expected: all existing tests pass with no import errors.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/index.ts packages/daemon/test/server.test.ts packages/daemon/test/process-manager.test.ts
git commit -m "refactor(daemon): import SQLiteStorage from local path after SDK relocation"
```

---

### Task 2: Write failing tests for `span.create` and `span.finish`

**Files:**
- Create: `packages/daemon/test/handlers.test.ts`

- [ ] **Step 1: Create the test file**

Create `packages/daemon/test/handlers.test.ts` with the following content:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SQLiteStorage } from "../src/sqlite-storage";
import { type HandlerContext, handleCommand } from "../src/handlers";

function makeCtx(storage: SQLiteStorage): HandlerContext {
	const broadcasts: Array<{ sessionId: string; event: { type: string; payload: unknown } }> = [];
	const ctx: HandlerContext = {
		storage,
		processManager: null as never,
		subscribers: new Map(),
		broadcast(sessionId, event) {
			broadcasts.push({ sessionId, event });
		},
	};
	(ctx as unknown as { _broadcasts: typeof broadcasts })._broadcasts = broadcasts;
	return ctx;
}

function getBroadcasts(ctx: HandlerContext) {
	return (ctx as unknown as { _broadcasts: Array<{ sessionId: string; event: { type: string; payload: unknown } }> })._broadcasts;
}

describe("span.create", () => {
	let storage: SQLiteStorage;
	let ctx: HandlerContext;
	let sessionId: string;

	beforeEach(async () => {
		storage = new SQLiteStorage(":memory:");
		ctx = makeCtx(storage);
		const session = await storage.createSession({ working_dir: "/tmp" });
		sessionId = session.id;
	});

	afterEach(() => {
		storage.close();
	});

	test("creates a span with status 'pending' by default", async () => {
		const span = await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "my-step",
		}) as { id: string; status: string; kind: string; name: string };

		expect(span.status).toBe("pending");
		expect(span.kind).toBe("step");
		expect(span.name).toBe("my-step");
	});

	test("accepts explicit status", async () => {
		const span = await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "running-step",
			status: "running",
		}) as { status: string };

		expect(span.status).toBe("running");
	});

	test("accepts parent_id", async () => {
		const parent = await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "workflow",
			name: "parent-workflow",
		}) as { id: string };

		const child = await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "child-step",
			parent_id: parent.id,
		}) as { id: string; parent_id: string | null };

		expect(child.parent_id).toBe(parent.id);
	});

	test("accepts data", async () => {
		const span = await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "data-step",
			data: { foo: "bar", count: 42 },
		}) as { data: Record<string, unknown> };

		expect(span.data).toMatchObject({ foo: "bar", count: 42 });
	});

	test("broadcasts span.started event with correct payload", async () => {
		const span = await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "broadcast-step",
		}) as { id: string };

		const broadcasts = getBroadcasts(ctx);
		expect(broadcasts).toHaveLength(1);
		expect(broadcasts[0].sessionId).toBe(sessionId);
		expect(broadcasts[0].event.type).toBe("span.started");
		const payload = broadcasts[0].event.payload as Record<string, unknown>;
		expect(payload.session_id).toBe(sessionId);
		expect(payload.span_id).toBe(span.id);
		expect(payload.kind).toBe("step");
		expect(payload.name).toBe("broadcast-step");
	});

	test("span is persisted in storage", async () => {
		const span = await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "hook",
			name: "persisted-hook",
		}) as { id: string };

		const fetched = await storage.getSpan(span.id);
		expect(fetched).not.toBeNull();
		expect(fetched?.name).toBe("persisted-hook");
		expect(fetched?.kind).toBe("hook");
	});
});

describe("span.finish", () => {
	let storage: SQLiteStorage;
	let ctx: HandlerContext;
	let sessionId: string;
	let spanId: string;

	beforeEach(async () => {
		storage = new SQLiteStorage(":memory:");
		ctx = makeCtx(storage);
		const session = await storage.createSession({ working_dir: "/tmp" });
		sessionId = session.id;
		const span = await storage.createSpan({
			session_id: sessionId,
			kind: "step",
			name: "test-span",
			status: "running",
		});
		spanId = span.id;
	});

	afterEach(() => {
		storage.close();
	});

	test("returns { success: true }", async () => {
		const result = await handleCommand(ctx, "span.finish", { id: spanId });
		expect(result).toEqual({ success: true });
	});

	test("sets finished_at", async () => {
		const before = Date.now();
		await handleCommand(ctx, "span.finish", { id: spanId });
		const after = Date.now();

		const span = await storage.getSpan(spanId);
		expect(span?.finished_at).toBeGreaterThanOrEqual(before);
		expect(span?.finished_at).toBeLessThanOrEqual(after);
	});

	test("defaults status to 'done'", async () => {
		await handleCommand(ctx, "span.finish", { id: spanId });
		const span = await storage.getSpan(spanId);
		expect(span?.status).toBe("done");
	});

	test("accepts 'failed' status", async () => {
		await handleCommand(ctx, "span.finish", { id: spanId, status: "failed" });
		const span = await storage.getSpan(spanId);
		expect(span?.status).toBe("failed");
	});

	test("broadcasts span.finished for 'done'", async () => {
		await handleCommand(ctx, "span.finish", { id: spanId });
		const broadcasts = getBroadcasts(ctx);
		expect(broadcasts).toHaveLength(1);
		expect(broadcasts[0].event.type).toBe("span.finished");
		const payload = broadcasts[0].event.payload as Record<string, unknown>;
		expect(payload.session_id).toBe(sessionId);
		expect(payload.span_id).toBe(spanId);
	});

	test("broadcasts span.failed for 'failed'", async () => {
		await handleCommand(ctx, "span.finish", { id: spanId, status: "failed" });
		const broadcasts = getBroadcasts(ctx);
		expect(broadcasts).toHaveLength(1);
		expect(broadcasts[0].event.type).toBe("span.failed");
		const payload = broadcasts[0].event.payload as Record<string, unknown>;
		expect(payload.session_id).toBe(sessionId);
		expect(payload.span_id).toBe(spanId);
	});

	test("throws 'Span not found: <id>' for missing span", async () => {
		const missingId = "00000000-0000-0000-0000-000000000000";
		expect(
			handleCommand(ctx, "span.finish", { id: missingId }),
		).rejects.toThrow(`Span not found: ${missingId}`);
	});
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
bun test packages/daemon/test/handlers.test.ts
```

Expected: tests fail with errors like `Unknown command: span.create` (the cases don't exist yet).

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/daemon/test/handlers.test.ts
git commit -m "test(daemon): add failing tests for span.create and span.finish handlers"
```

---

### Task 3: Implement `span.create` handler

**Files:**
- Modify: `packages/daemon/src/handlers.ts`

- [ ] **Step 1: Update the import in `handlers.ts`**

Current line 1:
```ts
import type { ContextItemType, SessionStatus, Span, Storage } from "@adlr/sdk";
```

Replace with:
```ts
import type { ContextItemType, SessionStatus, Span, SpanKind, SpanStatus, Storage } from "@adlr/sdk";
```

- [ ] **Step 2: Add the `span.create` case**

In `packages/daemon/src/handlers.ts`, add the following case in the `switch` block, immediately before the `case "span.get":` line (around line 131):

```ts
		case "span.create": {
			const data = payload as {
				session_id: string;
				parent_id?: string | null;
				kind: SpanKind;
				name: string;
				status?: SpanStatus;
				data?: Record<string, unknown>;
			};
			const span = await ctx.storage.createSpan({
				session_id: data.session_id,
				parent_id: data.parent_id,
				kind: data.kind,
				name: data.name,
				status: data.status ?? "pending",
				data: data.data,
			});
			ctx.broadcast(data.session_id, {
				type: "span.started",
				payload: {
					session_id: data.session_id,
					span_id: span.id,
					kind: data.kind,
					name: data.name,
					parent_id: data.parent_id ?? null,
				},
			});
			return span;
		}
```

- [ ] **Step 3: Run the `span.create` tests**

```bash
bun test packages/daemon/test/handlers.test.ts
```

Expected: all `span.create` tests pass; `span.finish` tests still fail with `Unknown command: span.finish`.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/handlers.ts
git commit -m "feat(daemon): add span.create command handler"
```

---

### Task 4: Implement `span.finish` handler

**Files:**
- Modify: `packages/daemon/src/handlers.ts`

- [ ] **Step 1: Add the `span.finish` case**

In `packages/daemon/src/handlers.ts`, add the following case immediately after the closing brace of the `span.create` case you just added:

```ts
		case "span.finish": {
			const { id, status } = payload as { id: string; status?: "done" | "failed" };
			const span = await ctx.storage.getSpan(id);
			if (!span) throw new Error(`Span not found: ${id}`);
			const finalStatus: SpanStatus = status ?? "done";
			await ctx.storage.updateSpan(id, {
				status: finalStatus,
				finished_at: Date.now(),
			});
			ctx.broadcast(span.session_id, {
				type: finalStatus === "failed" ? "span.failed" : "span.finished",
				payload: { session_id: span.session_id, span_id: id },
			});
			return { success: true };
		}
```

- [ ] **Step 2: Run all handlers tests**

```bash
bun test packages/daemon/test/handlers.test.ts
```

Expected: all tests in `handlers.test.ts` pass.

- [ ] **Step 3: Run the full daemon test suite**

```bash
bun test packages/daemon
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/handlers.ts
git commit -m "feat(daemon): add span.finish command handler"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run daemon tests**

```bash
bun test packages/daemon
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Type-check the daemon package**

```bash
bun typecheck --filter='packages/daemon'
```

Expected: no type errors.

- [ ] **Step 3: Lint the daemon package**

```bash
bun lint --filter='packages/daemon'
```

Expected: no lint errors. If there are auto-fixable issues, run:

```bash
bun lint --filter='packages/daemon' --write
git add -p
git commit -m "chore(daemon): fix lint issues"
```

- [ ] **Step 4: Run the full workspace test suite**

```bash
bun test
```

Expected: all tests across all packages pass.
