import type { Event } from "@adler/sdk";
import { Theme } from "../theme";

function levelFromType(type: string): "info" | "warn" | "error" | "other" {
	if (type.startsWith("log.info")) return "info";
	if (type.startsWith("log.warn")) return "warn";
	if (type.startsWith("log.error")) return "error";
	return "other";
}

export function LogLine({
	event,
	isSelected: _isSelected,
	width,
}: {
	event: Event;
	isSelected: boolean;
	width?: number;
}) {
	const level = levelFromType(event.type);
	const color = Theme.level[level];
	const message =
		typeof event.data?.message === "string"
			? event.data.message
			: JSON.stringify(event.data);
	return (
		<box style={{ width, overflow: "hidden" }}>
			<text>
				<span fg="#666">{new Date(event.timestamp).toLocaleTimeString()} </span>
				<span bg={color} fg="black">
					{" "}
					{level.toUpperCase()}{" "}
				</span>
				<span> {event.type}</span>
				<span fg="#666"> {message}</span>
			</text>
		</box>
	);
}
