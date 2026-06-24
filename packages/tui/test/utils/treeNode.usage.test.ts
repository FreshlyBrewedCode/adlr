import { describe, expect, it } from "bun:test";
import type { AgentSpan, Span } from "@adlr/sdk";

// Mirrors the derivation logic in TreeNode
function deriveAgentUsage(span: Span) {
	return span.kind === "agent" ? (span as AgentSpan).data?.usage : undefined;
}

function makeSpan(kind: Span["kind"], data?: Record<string, unknown>): Span {
	return {
		id: "span-1",
		session_id: "sess-1",
		parent_id: null,
		kind,
		name: "test",
		status: "done",
		started_at: 1000,
		finished_at: 2000,
		data: data ?? {},
	};
}

describe("TreeNode — usage derivation", () => {
	it("agent with usage → agentUsage is defined (shouldShowUsage = true)", () => {
		const span = makeSpan("agent", {
			usage: {
				tokens: { input: 500, output: 100, total: 600 },
				cost_usd: 0.01,
			},
		});
		const result = deriveAgentUsage(span);
		expect(result).toBeDefined();
		expect(result?.cost_usd).toBe(0.01);
	});

	it("agent without usage → agentUsage is undefined (shouldShowUsage = false)", () => {
		const span = makeSpan("agent", { agent_type: "opencode" });
		const result = deriveAgentUsage(span);
		expect(result).toBeUndefined();
	});

	it("non-agent span with data → agentUsage is undefined regardless", () => {
		const span = makeSpan("step", {
			usage: { tokens: { input: 100, output: 50, total: 150 }, cost_usd: 0.02 },
		});
		const result = deriveAgentUsage(span);
		expect(result).toBeUndefined();
	});
});
