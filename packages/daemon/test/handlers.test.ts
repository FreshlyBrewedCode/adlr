import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { HandlerContext } from "../src/handlers";
import { handleCommand } from "../src/handlers";
import type { ProcessManager } from "../src/process-manager";
import { SQLiteStorage } from "../src/sqlite-storage";

describe("Daemon handlers - span", () => {
	let storage: SQLiteStorage;
	let ctx: HandlerContext;
	let broadcasts: Array<{
		sessionId: string;
		event: { type: string; payload: unknown };
	}>;

	beforeEach(() => {
		storage = new SQLiteStorage(":memory:");
		broadcasts = [];
		ctx = {
			storage,
			processManager: {} as unknown as ProcessManager,
			subscribers: new Map(),
			broadcast: (sessionId, event) => {
				broadcasts.push({ sessionId, event });
			},
		};
	});

	afterEach(() => {
		storage.close();
	});

	test("span.create creates a span with the right fields and broadcasts", async () => {
		const session = await storage.createSession({ working_dir: "/tmp" });

		const result = await handleCommand(ctx, "span.create", {
			session_id: session.id,
			kind: "step",
			name: "my-step",
			data: { key: "value" },
		});

		const span = result as Record<string, unknown>;
		expect(span.session_id).toBe(session.id);
		expect(span.kind).toBe("step");
		expect(span.name).toBe("my-step");
		expect(span.status).toBe("pending");
		expect(span.parent_id).toBeNull();
		expect(span.finished_at).toBeNull();
		expect(span.data).toEqual({ key: "value" });
		expect(span.id).toBeString();
		expect(span.started_at).toBeNumber();

		expect(broadcasts).toHaveLength(1);
		expect(broadcasts[0].sessionId).toBe(session.id);
		expect(broadcasts[0].event.type).toBe("span.created");
		expect(broadcasts[0].event.payload).toEqual({
			session_id: session.id,
			span_id: span.id,
			kind: "step",
			name: "my-step",
			parent_id: null,
		});
	});

	test("span.finish updates status, finished_at, merges data, and broadcasts", async () => {
		const session = await storage.createSession({ working_dir: "/tmp" });
		const created = await storage.createSpan({
			session_id: session.id,
			kind: "step",
			name: "my-step",
			data: { original: 1 },
		});

		const before = Date.now();
		const result = await handleCommand(ctx, "span.finish", {
			id: created.id,
			data: { extra: 2 },
		});

		expect(result).toEqual({ success: true });

		const span = await storage.getSpan(created.id);
		expect(span).not.toBeNull();
		expect(span?.status).toBe("done");
		expect(span?.finished_at).toBeNumber();
		expect((span?.finished_at as number) >= before).toBe(true);
		expect(span?.data).toEqual({ original: 1, extra: 2 });

		expect(broadcasts).toHaveLength(1);
		expect(broadcasts[0].sessionId).toBe(session.id);
		expect(broadcasts[0].event.type).toBe("span.finished");
		expect(broadcasts[0].event.payload).toEqual({
			session_id: session.id,
			span_id: created.id,
		});
	});

	test("span.finish returns an error for a missing span", async () => {
		await expect(
			handleCommand(ctx, "span.finish", { id: "missing-span", data: {} }),
		).rejects.toThrow("Span not found: missing-span");
	});
});
