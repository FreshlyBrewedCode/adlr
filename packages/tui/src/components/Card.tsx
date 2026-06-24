import type { SpanUsage } from "@adlr/sdk";
import { Theme } from "../theme";
import { formatUsageSummary } from "../utils/formatUsage";

export function Card({
	title,
	description,
	status,
	hint,
	usage,
	isSelected: _isSelected,
	width,
	children,
}: {
	title: string;
	description?: string;
	status: "done" | "failed" | "blocked" | "running" | "pending";
	hint?: string;
	usage?: SpanUsage;
	isSelected?: boolean;
	width?: number;
	children?: React.ReactNode;
}) {
	const statusColor = Theme.status[status];
	return (
		<box
			style={{
				width,
				flexDirection: "column",
				border: ["left"],
				borderColor: statusColor,
				customBorderChars: {
					topLeft: "",
					topRight: "",
					vertical: "┃",
					bottomLeft: "",
					bottomRight: "",
					horizontal: "",
					topT: "",
					bottomT: "",
					leftT: "",
					rightT: "",
					cross: "",
				},
				backgroundColor: Theme.card.base,
				padding: 1,
			}}
		>
			<text fg={statusColor}>
				<b>{title}</b>
			</text>
			{description && <text fg="#666">{description}</text>}
			{usage && <text fg={Theme.muted}>{formatUsageSummary(usage)}</text>}
			{children}
			{hint && <text fg="#666"> {hint}</text>}
		</box>
	);
}
