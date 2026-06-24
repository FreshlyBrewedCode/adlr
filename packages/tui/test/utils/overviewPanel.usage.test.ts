import { describe, expect, it } from "bun:test";
import type { Span } from "@adlr/sdk";
import { computeSessionTotals } from "../../src/components/panels/OverviewPanel";
import { formatCost, formatTokens } from "../../src/utils/formatUsage";

function makeSpan(kind: Span["kind"], data?: Record<string, unknown>): Span {
	return {
		id: `span-${Math.random()}`,
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

describe("computeSessionTotals", () => {
	it("returns hasUsage=false when no spans have usage", () => {
		const spans: Span[] = [
			makeSpan("agent", { agent_type: "opencode" }),
			makeSpan("step"),
		];
		const result = computeSessionTotals(spans);
		expect(result.hasUsage).toBe(false);
		expect(result.totalInput).toBe(0);
		expect(result.totalOutput).toBe(0);
		expect(result.totalCost).toBe(0);
	});

	it("sums tokens and cost across two agent spans with usage", () => {
		const spans: Span[] = [
			makeSpan("agent", {
				usage: {
					tokens: { input: 1200, output: 340, total: 1540 },
					cost_usd: 0.04,
				},
			}),
			makeSpan("agent", {
				usage: {
					tokens: { input: 13100, output: 1760, total: 14860 },
					cost_usd: 0.27,
				},
			}),
		];
		const result = computeSessionTotals(spans);
		expect(result.hasUsage).toBe(true);
		expect(result.totalInput).toBe(14300);
		expect(result.totalOutput).toBe(2100);
		expect(result.totalCost).toBeCloseTo(0.31, 5);
	});

	it("skips non-agent spans and agent spans without usage", () => {
		const spans: Span[] = [
			makeSpan("agent", {
				usage: {
					tokens: { input: 14300, output: 2100, total: 16400 },
					cost_usd: 0.31,
				},
			}),
			makeSpan("step", {
				usage: {
					tokens: { input: 999, output: 999, total: 1998 },
					cost_usd: 99,
				},
			}),
			makeSpan("agent", { agent_type: "opencode" }), // no usage
		];
		const result = computeSessionTotals(spans);
		expect(result.hasUsage).toBe(true);
		expect(result.totalInput).toBe(14300);
		expect(result.totalOutput).toBe(2100);
		expect(result.totalCost).toBeCloseTo(0.31, 5);
	});

	it("formats totals as expected summary string", () => {
		const spans: Span[] = [
			makeSpan("agent", {
				usage: {
					tokens: { input: 14300, output: 2100, total: 16400 },
					cost_usd: 0.31,
				},
			}),
		];
		const { hasUsage, totalInput, totalOutput, totalCost } =
			computeSessionTotals(spans);
		expect(hasUsage).toBe(true);
		const summary = `Total:  ↑ ${formatTokens(totalInput)}  ↓ ${formatTokens(totalOutput)}  ${formatCost(totalCost)}`;
		expect(summary).toBe("Total:  ↑ 14.3k  ↓ 2.1k  $0.31");
	});
});
