import type { Span } from "@adler/sdk";
import { Theme } from "../theme";

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
	return (
		<box style={{ backgroundColor: isSelected ? "gray" : undefined }}>
			<text>
				{"  ".repeat(depth)}
				<span fg={statusColor}>{indicator} </span>
				{span.name}
				<span fg="#666"> {span.status}</span>
			</text>
		</box>
	);
}
