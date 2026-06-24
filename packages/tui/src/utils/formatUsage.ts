import type { SpanUsage } from "@adlr/sdk";

export function formatTokens(n: number): string {
	if (n < 1000) return String(n);
	return `${(n / 1000).toFixed(1)}k`;
}

export function formatCost(usd: number): string {
	return `$${usd.toFixed(2)}`;
}

export function formatUsageSummary(usage: SpanUsage): string {
	return `↑ ${formatTokens(usage.tokens.input)}  ↓ ${formatTokens(usage.tokens.output)}  ${formatCost(usage.cost_usd)}`;
}
