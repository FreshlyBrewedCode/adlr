import { describe, expect, it } from "bun:test";
import type { SpanUsage } from "@adlr/sdk";
import {
	formatCost,
	formatTokens,
	formatUsageSummary,
} from "../../src/utils/formatUsage";

describe("formatTokens", () => {
	it("returns plain string for 0", () => {
		expect(formatTokens(0)).toBe("0");
	});
	it("returns plain string for 340", () => {
		expect(formatTokens(340)).toBe("340");
	});
	it("returns plain string for 999", () => {
		expect(formatTokens(999)).toBe("999");
	});
	it("formats 1000 as 1.0k", () => {
		expect(formatTokens(1000)).toBe("1.0k");
	});
	it("formats 1200 as 1.2k", () => {
		expect(formatTokens(1200)).toBe("1.2k");
	});
	it("formats 14300 as 14.3k", () => {
		expect(formatTokens(14300)).toBe("14.3k");
	});
});

describe("formatCost", () => {
	it("formats 0 as $0.00", () => {
		expect(formatCost(0)).toBe("$0.00");
	});
	it("formats 0.04 as $0.04", () => {
		expect(formatCost(0.04)).toBe("$0.04");
	});
	it("formats 0.311 as $0.31 (truncates, does not round up in display)", () => {
		expect(formatCost(0.311)).toBe("$0.31");
	});
	it("formats 1.5 as $1.50", () => {
		expect(formatCost(1.5)).toBe("$1.50");
	});
});

describe("formatUsageSummary", () => {
	it("formats a full usage object correctly", () => {
		const usage: SpanUsage = {
			tokens: { input: 1200, output: 340, total: 1540 },
			cost_usd: 0.04,
		};
		expect(formatUsageSummary(usage)).toBe("↑ 1.2k  ↓ 340  $0.04");
	});
});
