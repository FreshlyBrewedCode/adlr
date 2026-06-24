import { describe, expect, it } from "bun:test";
import type { AgentSpan } from "@adlr/sdk";
import { formatUsageSummary } from "../../src/utils/formatUsage";

function makeAgentSpan(overrides?: Partial<AgentSpan["data"]>): AgentSpan {
	return {
		id: "span-1",
		session_id: "sess-1",
		parent_id: null,
		kind: "agent",
		name: "opencode",
		status: "done",
		started_at: 1000,
		finished_at: 2000,
		data: {
			agent_type: "opencode",
			prompt: "write tests",
			...overrides,
		},
	};
}

describe("AgentsPanel — Card usage prop", () => {
	it("passes correct formatted string when usage is present", () => {
		const span = makeAgentSpan({
			usage: {
				tokens: { input: 1200, output: 340, total: 1540 },
				cost_usd: 0.04,
			},
		});
		expect(span.data.usage).toBeDefined();
		expect(formatUsageSummary(span.data.usage!)).toBe("↑ 1.2k  ↓ 340  $0.04");
	});

	it("data.usage is undefined when not provided", () => {
		const span = makeAgentSpan();
		expect(span.data.usage).toBeUndefined();
	});
});
