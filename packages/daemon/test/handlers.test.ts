import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { type HandlerContext, handleCommand } from "../src/handlers";
import { SQLiteStorage } from "../src/sqlite-storage";

function makeCtx(storage: SQLiteStorage): HandlerContext {
	const broadcasts: Array<{
		sessionId: string;
		event: { type: string; payload: unknown };
	}> = [];
	const ctx: HandlerContext = {
		storage,
		processManager: null as never,
		subscribers: new Map(),
		broadcast(sessionId, event) {
			broadcasts.push({ sessionId, event });
		},
	};
	(ctx as unknown as { _broadcasts: typeof broadcasts })._broadcasts =
		broadcasts;
	return ctx;
}

function getBroadcasts(ctx: HandlerContext) {
	return (
		ctx as unknown as {
			_broadcasts: Array<{
				sessionId: string;
				event: { type: string; payload: unknown };
			}>;
		}
	)._broadcasts;
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
		const span = (await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "my-step",
		})) as { id: string; status: string; kind: string; name: string };

		expect(span.status).toBe("pending");
		expect(span.kind).toBe("step");
		expect(span.name).toBe("my-step");
	});

	test("accepts explicit status", async () => {
		const span = (await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "running-step",
			status: "running",
		})) as { status: string };

		expect(span.status).toBe("running");
	});

	test("accepts parent_id", async () => {
		const parent = (await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "workflow",
			name: "parent-workflow",
		})) as { id: string };

		const child = (await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "child-step",
			parent_id: parent.id,
		})) as { id: string; parent_id: string | null };

		expect(child.parent_id).toBe(parent.id);
	});

	test("accepts data", async () => {
		const span = (await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "data-step",
			data: { foo: "bar", count: 42 },
		})) as { data: Record<string, unknown> };

		expect(span.data).toMatchObject({ foo: "bar", count: 42 });
	});

	test("broadcasts span.started event with correct payload", async () => {
		const span = (await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "step",
			name: "broadcast-step",
		})) as { id: string };

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
		const span = (await handleCommand(ctx, "span.create", {
			session_id: sessionId,
			kind: "hook",
			name: "persisted-hook",
		})) as { id: string };

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
