import { describe, expect, test } from "bun:test";
import { RootSpanResolver } from "../src/root-span-resolver";
import type { AdlrClient } from "../src/types";

function makeMockClient(spanId = "root-span-1"): {
	client: AdlrClient;
	createCalls: Array<Parameters<AdlrClient["span"]["create"]>[0]>;
} {
	const createCalls: Array<Parameters<AdlrClient["span"]["create"]>[0]> = [];

	const client: AdlrClient = {
		span: {
			create: async (input) => {
				createCalls.push(input);
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
				};
			},
			finish: async () => {},
			update: async () => {},
		},
	};

	return { client, createCalls };
}

describe("RootSpanResolver", () => {
	test("resolve() creates span on first call", async () => {
		const { client, createCalls } = makeMockClient("root-span-1");
		const resolver = new RootSpanResolver("adlr-sess-1", client);

		const id = await resolver.resolve();

		expect(id).toBe("root-span-1");
		expect(createCalls).toHaveLength(1);
		expect(createCalls[0]).toMatchObject({
			session_id: "adlr-sess-1",
			kind: "agent",
			name: "opencode",
			status: "running",
		});
	});

	test("resolve() returns cached span ID on second call — no second create", async () => {
		const { client, createCalls } = makeMockClient("root-span-2");
		const resolver = new RootSpanResolver("adlr-sess-2", client);

		const id1 = await resolver.resolve();
		const id2 = await resolver.resolve();

		expect(id1).toBe("root-span-2");
		expect(id2).toBe("root-span-2");
		expect(createCalls).toHaveLength(1);
	});

	test("concurrent resolve() calls only create one span", async () => {
		const { client, createCalls } = makeMockClient("root-span-3");
		const resolver = new RootSpanResolver("adlr-sess-3", client);

		const [id1, id2, id3] = await Promise.all([
			resolver.resolve(),
			resolver.resolve(),
			resolver.resolve(),
		]);

		expect(id1).toBe("root-span-3");
		expect(id2).toBe("root-span-3");
		expect(id3).toBe("root-span-3");
		expect(createCalls).toHaveLength(1);
	});

	test("managed mode: provided spanId is returned without calling span.create", async () => {
		const { client, createCalls } = makeMockClient("should-not-be-used");
		const resolver = new RootSpanResolver(
			"adlr-sess-4",
			client,
			"existing-span-id",
		);

		const id = await resolver.resolve();

		expect(id).toBe("existing-span-id");
		expect(createCalls).toHaveLength(0);
	});
});
