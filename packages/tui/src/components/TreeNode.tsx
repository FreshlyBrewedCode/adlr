import type { AgentSpan, Span } from "@adlr/sdk";
import { Theme } from "../theme";
import { formatUsageSummary } from "../utils/formatUsage";

export function TreeNode({
	span,
	depth,
	isSelected,
}: {
	span: Span;
	depth: number;
	isSelected: boolean;
}) {
	const statusColor =
		Theme.status[span.status as keyof typeof Theme.status] ?? Theme.muted;
	const indicator = span.kind === "agent" ? "●" : "○";

	const agentUsage =
		span.kind === "agent" ? (span as AgentSpan).data?.usage : undefined;

	return (
		<box style={{ backgroundColor: isSelected ? "gray" : undefined }}>
			<text>
				{"  ".repeat(depth)}
				<span fg={statusColor}>{indicator} </span>
				{span.name}
				<span fg="#666"> {span.status}</span>
				{agentUsage && (
					<span fg={Theme.muted}>
						{"  "}
						{formatUsageSummary(agentUsage)}
					</span>
				)}
			</text>
		</box>
	);
}
