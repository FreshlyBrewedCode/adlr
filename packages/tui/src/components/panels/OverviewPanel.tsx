import type { AgentSpan, Span } from "@adlr/sdk";
import type { PanelProps } from "../../core/types";
import { Theme } from "../../theme";
import { formatCost, formatTokens } from "../../utils/formatUsage";
import { StatusBadge } from "../StatusBadge";

export interface SessionTotals {
	hasUsage: boolean;
	totalInput: number;
	totalOutput: number;
	totalCost: number;
}

export function computeSessionTotals(spans: Span[]): SessionTotals {
	let totalInput = 0;
	let totalOutput = 0;
	let totalCost = 0;
	let hasUsage = false;

	for (const span of spans) {
		if (span.kind !== "agent") continue;
		const usage = (span as AgentSpan).data?.usage;
		if (!usage) continue;
		hasUsage = true;
		totalInput += usage.tokens.input;
		totalOutput += usage.tokens.output;
		totalCost += usage.cost_usd;
	}

	return { hasUsage, totalInput, totalOutput, totalCost };
}

export function OverviewPanel({ state, width, height }: PanelProps) {
	const recentAgents = state.spans
		.filter((s) => s.kind === "agent")
		.sort((a, b) => b.started_at - a.started_at)
		.slice(0, 5);

	const totals = computeSessionTotals(state.spans);

	return (
		<box style={{ flexDirection: "row", width, height }}>
			<box style={{ flexDirection: "column", width: "50%" }}>
				<text>
					<b>Session</b>
				</text>
				<text>Status: {state.session?.status}</text>
				<text>Working dir: {state.session?.working_dir}</text>
				{totals.hasUsage && (
					<text fg={Theme.muted}>
						Total:{"  "}↑ {formatTokens(totals.totalInput)}
						{"  "}↓ {formatTokens(totals.totalOutput)}
						{"  "}
						{formatCost(totals.totalCost)}
					</text>
				)}
				<box style={{ marginTop: 1 }}>
					<text>
						<b>Recent Agents</b>
					</text>
				</box>
				{recentAgents.map((a) => (
					<box key={a.id}>
						<StatusBadge status={a.status} />
						<text> {a.name}</text>
					</box>
				))}
			</box>
			<box style={{ flexDirection: "column", width: "50%" }}>
				<text>
					<b>Context</b>
				</text>
				{state.context.map((item) => (
					<box key={item.id}>
						<text
							fg={
								Theme.type[item.type as keyof typeof Theme.type] ?? Theme.muted
							}
						>
							{item.type}
						</text>
						<text> {item.label ?? "—"}</text>
					</box>
				))}
			</box>
		</box>
	);
}
