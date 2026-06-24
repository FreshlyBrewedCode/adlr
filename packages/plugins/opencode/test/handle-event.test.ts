import { describe, expect, test } from "bun:test";
import { handleEvent, type PluginContext } from "../src/handle-event";
import { RootSpanResolver } from "../src/root-span-resolver";
import { SpanMap } from "../src/span-map";
import type { AdlrClient } from "../src/types";

let spanCounter = 0;

function makeMock(rootSpanId: string | null = "root-span") {
	spanCounter = 0;
	const createCalls: Array<Parameters<AdlrClient["span"]["create"]>[0]> = [];
	const finishCalls: Array<{ id: string; status?: "done" | "failed" }> = [];
	const updateCalls: Array<{
		id: string;
		data: Record<string, unknown>;
		options?: { merge?: boolean };
	}> = [];

	const client: AdlrClient = {
		span: {
			create: async (input) => {
				createCalls.push(input);
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
				};
			},
			finish: async (id, status) => {
				finishCalls.push({ id, status });
			},
			update: async (id, data, options) => {
				updateCalls.push({
					id,
					data: data as Record<string, unknown>,
					options,
				});
			},
		},
	};

	const spanMap = new SpanMap();
	const rootResolver = new RootSpanResolver(
		"adlr-session-1",
		client,
		rootSpanId ?? undefined,
	);

	const ctx: PluginContext = {
		client,
		spanMap,
		rootResolver,
		sessionId: "adlr-session-1",
	};

	return { client, ctx, createCalls, finishCalls, updateCalls, spanMap };
}

describe("handleEvent — session.created", () => {
	test("creates child span as child of root span when parentID is set", async () => {
		const { ctx, createCalls, spanMap } = makeMock("root-span");
		await handleEvent(
			{
				type: "session.created",
				properties: {
					info: { id: "oc-sub-1", parentID: "oc-parent-1", title: "subagent" },
				},
			},
			ctx,
		);

		expect(createCalls).toHaveLength(1);
		expect(createCalls[0]).toMatchObject({
			session_id: "adlr-session-1",
			parent_id: "root-span",
			kind: "agent",
			name: "subagent",
		});
		expect(spanMap.has("oc-sub-1")).toBe(true);
	});

	test("stores opencodeSessionID→adlrSpanID in spanMap after creation", async () => {
		const { ctx, spanMap } = makeMock("root-span");
		await handleEvent(
			{
				type: "session.created",
				properties: { info: { id: "oc-sub-2", parentID: "oc-parent-1" } },
			},
			ctx,
		);

		expect(spanMap.get("oc-sub-2")).toBeDefined();
	});

	test("does NOT create span when parentID is absent (root session — not a subagent)", async () => {
		const { ctx, createCalls } = makeMock();
		await handleEvent(
			{
				type: "session.created",
				properties: { info: { id: "oc-root-1" } },
			},
			ctx,
		);

		expect(createCalls).toHaveLength(0);
	});

	test("uses session title as span name when present", async () => {
		const { ctx, createCalls } = makeMock();
		await handleEvent(
			{
				type: "session.created",
				properties: {
					info: { id: "oc-titled", parentID: "oc-parent", title: "my-agent" },
				},
			},
			ctx,
		);

		expect(createCalls[0].name).toBe("my-agent");
	});

	test("falls back to sessionID as span name when title is absent", async () => {
		const { ctx, createCalls } = makeMock();
		await handleEvent(
			{
				type: "session.created",
				properties: { info: { id: "oc-no-title", parentID: "oc-parent" } },
			},
			ctx,
		);

		expect(createCalls[0].name).toBe("oc-no-title");
	});
});

describe("handleEvent — session.idle", () => {
	test("finishes the mapped span when sessionID is in spanMap", async () => {
		const { ctx, finishCalls, spanMap } = makeMock();
		spanMap.set("oc-sub-3", "adlr-span-3");

		await handleEvent(
			{
				type: "session.idle",
				properties: { sessionID: "oc-sub-3" },
			},
			ctx,
		);

		expect(finishCalls).toHaveLength(1);
		expect(finishCalls[0]).toEqual({ id: "adlr-span-3", status: "done" });
		expect(spanMap.isFinished("oc-sub-3")).toBe(true);
	});

	test("finishes root span when sessionID is not a tracked subagent (root session going idle)", async () => {
		const { ctx, finishCalls } = makeMock("root-span");
		// Trigger resolve() so that a root span is in place before idle fires.
		await ctx.rootResolver.resolve();

		await handleEvent(
			{
				type: "session.idle",
				properties: { sessionID: "unknown-session" },
			},
			ctx,
		);

		expect(finishCalls).toHaveLength(1);
		expect(finishCalls[0]).toEqual({ id: "root-span", status: "done" });
	});

	test("does nothing when sessionID is not in spanMap and no root span was ever created", async () => {
		// Pass null so no managedSpanId is pre-set; resolve() is never called.
		const { ctx, finishCalls } = makeMock(null);
		await handleEvent(
			{
				type: "session.idle",
				properties: { sessionID: "unknown-session" },
			},
			ctx,
		);

		expect(finishCalls).toHaveLength(0);
	});
});

describe("handleEvent — session.deleted", () => {
	test("finishes span when in spanMap and not already finished", async () => {
		const { ctx, finishCalls, spanMap } = makeMock();
		spanMap.set("oc-sub-4", "adlr-span-4");

		await handleEvent(
			{
				type: "session.deleted",
				properties: { sessionID: "oc-sub-4" },
			},
			ctx,
		);

		expect(finishCalls).toHaveLength(1);
		expect(finishCalls[0]).toEqual({ id: "adlr-span-4", status: "done" });
	});

	test("does NOT finish span when already finished (double-finish guard)", async () => {
		const { ctx, finishCalls, spanMap } = makeMock();
		spanMap.set("oc-sub-5", "adlr-span-5");
		spanMap.markFinished("oc-sub-5");

		await handleEvent(
			{
				type: "session.deleted",
				properties: { sessionID: "oc-sub-5" },
			},
			ctx,
		);

		expect(finishCalls).toHaveLength(0);
	});

	test("does nothing when sessionID not in spanMap", async () => {
		const { ctx, finishCalls } = makeMock();
		await handleEvent(
			{
				type: "session.deleted",
				properties: { sessionID: "never-tracked" },
			},
			ctx,
		);

		expect(finishCalls).toHaveLength(0);
	});
});

describe("handleEvent — message.part.updated (step-finish)", () => {
	test("updates mapped span with usage from step-finish part", async () => {
		const { ctx, updateCalls, spanMap } = makeMock();
		spanMap.set("oc-sub-6", "adlr-span-6");

		await handleEvent(
			{
				type: "message.part.updated",
				properties: {
					sessionID: "oc-sub-6",
					part: {
						type: "step-finish",
						tokens: {
							total: 500,
							input: 300,
							output: 200,
							cache: { write: 50, read: 25 },
						},
						cost: 0.005,
					},
				},
			},
			ctx,
		);

		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0].id).toBe("adlr-span-6");
		expect(updateCalls[0].data).toMatchObject({
			usage: {
				tokens: { input: 300, output: 200, cache_read: 25, cache_write: 50 },
				cost_usd: 0.005,
			},
		});
		expect(updateCalls[0].options).toEqual({ merge: true });
	});

	test("falls back to root span when sessionID not in spanMap", async () => {
		const { ctx, updateCalls } = makeMock("root-span");
		await handleEvent(
			{
				type: "message.part.updated",
				properties: {
					sessionID: "unmapped-session",
					part: {
						type: "step-finish",
						tokens: {
							total: 100,
							input: 80,
							output: 20,
							cache: { write: 0, read: 0 },
						},
						cost: 0.001,
					},
				},
			},
			ctx,
		);

		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0].id).toBe("root-span");
	});

	test("does nothing for non-step-finish part types", async () => {
		const { ctx, updateCalls } = makeMock();
		await handleEvent(
			{
				type: "message.part.updated",
				properties: { sessionID: "oc-sess", part: { type: "text" } },
			},
			ctx,
		);

		expect(updateCalls).toHaveLength(0);
	});

	test("defaults cache_read and cache_write to 0 when cache field is absent", async () => {
		const { ctx, updateCalls, spanMap } = makeMock();
		spanMap.set("oc-sub-7", "adlr-span-7");

		await handleEvent(
			{
				type: "message.part.updated",
				properties: {
					sessionID: "oc-sub-7",
					part: {
						type: "step-finish",
						tokens: { total: 200, input: 150, output: 50 },
						cost: 0.002,
					},
				},
			},
			ctx,
		);

		expect(updateCalls[0].data).toMatchObject({
			usage: {
				tokens: { input: 150, output: 50, cache_read: 0, cache_write: 0 },
				cost_usd: 0.002,
			},
		});
	});
});

describe("handleEvent — session.updated", () => {
	test("updates root span with cumulative cost and tokens", async () => {
		const { ctx, updateCalls } = makeMock("root-span");
		await handleEvent(
			{
				type: "session.updated",
				properties: {
					info: {
						id: "oc-root-session",
						cost: 0.12,
						tokens: { input: 5000, output: 1200 },
					},
				},
			},
			ctx,
		);

		expect(updateCalls).toHaveLength(1);
		expect(updateCalls[0].id).toBe("root-span");
		expect(updateCalls[0].data).toMatchObject({
			usage: { cost_usd: 0.12, tokens: { input: 5000, output: 1200 } },
		});
		expect(updateCalls[0].options).toEqual({ merge: true });
	});

	test("skips update when neither cost nor tokens are present on event", async () => {
		const { ctx, updateCalls } = makeMock("root-span");
		await handleEvent(
			{
				type: "session.updated",
				properties: { info: { id: "oc-bare" } },
			},
			ctx,
		);

		expect(updateCalls).toHaveLength(0);
	});
});

describe("handleEvent — unknown events", () => {
	test("ignores unrecognised event types without throwing", async () => {
		const { ctx } = makeMock();
		await expect(
			handleEvent({ type: "some.unknown.event", properties: {} }, ctx),
		).resolves.toBeUndefined();
	});
});
