import { describe, expect, test } from "bun:test";
import type {
	AdlrClient,
	OpenCodeEvent,
	SessionCreatedEvent,
	SessionDeletedEvent,
	SessionIdleEvent,
	SessionUpdatedEvent,
	StepFinishPartUpdatedEvent,
} from "../src/types";

describe("AdlrClient interface", () => {
	test("mock object satisfies AdlrClient structurally", () => {
		const calls: string[] = [];

		const mock: AdlrClient = {
			span: {
				create: async (input) => {
					calls.push(`create:${input.name}`);
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
					};
				},
				finish: async (id, _status) => {
					calls.push(`finish:${id}`);
				},
				update: async (id, _data, _options) => {
					calls.push(`update:${id}`);
				},
			},
		};

		expect(mock.span).toBeDefined();
		expect(typeof mock.span.create).toBe("function");
		expect(typeof mock.span.finish).toBe("function");
		expect(typeof mock.span.update).toBe("function");
	});
});

describe("OpenCodeEvent discriminant union", () => {
	test("session.created event discriminant is correct", () => {
		const event: OpenCodeEvent = {
			type: "session.created",
			properties: { info: { id: "s1", parentID: "p1", title: "my-agent" } },
		};
		expect(event.type).toBe("session.created");
		if (event.type === "session.created") {
			const props = event.properties as SessionCreatedEvent["properties"];
			expect(props.info.id).toBe("s1");
			expect(props.info.parentID).toBe("p1");
		}
	});

	test("session.idle event discriminant is correct", () => {
		const event: OpenCodeEvent = {
			type: "session.idle",
			properties: { sessionID: "s2" },
		};
		expect(event.type).toBe("session.idle");
		if (event.type === "session.idle") {
			const props = event.properties as SessionIdleEvent["properties"];
			expect(props.sessionID).toBe("s2");
		}
	});

	test("session.deleted event discriminant is correct", () => {
		const event: OpenCodeEvent = {
			type: "session.deleted",
			properties: { sessionID: "s3" },
		};
		if (event.type === "session.deleted") {
			const props = event.properties as SessionDeletedEvent["properties"];
			expect(props.sessionID).toBe("s3");
		}
	});

	test("message.part.updated (step-finish) event discriminant is correct", () => {
		const event: OpenCodeEvent = {
			type: "message.part.updated",
			properties: {
				sessionID: "s4",
				part: {
					type: "step-finish",
					tokens: {
						total: 100,
						input: 80,
						output: 20,
						cache: { write: 0, read: 5 },
					},
					cost: 0.001,
				},
			},
		};
		if (event.type === "message.part.updated") {
			const props =
				event.properties as StepFinishPartUpdatedEvent["properties"];
			expect(props.sessionID).toBe("s4");
			expect(props.part.type).toBe("step-finish");
		}
	});

	test("session.updated event discriminant is correct", () => {
		const event: OpenCodeEvent = {
			type: "session.updated",
			properties: {
				info: { id: "s5", cost: 0.05, tokens: { input: 1000, output: 200 } },
			},
		};
		if (event.type === "session.updated") {
			const props = event.properties as SessionUpdatedEvent["properties"];
			expect(props.info.cost).toBe(0.05);
		}
	});

	test("unknown event type falls through to catch-all", () => {
		const event: OpenCodeEvent = {
			type: "some.unknown.event",
			properties: {},
		};
		expect(event.type).toBe("some.unknown.event");
	});
});
