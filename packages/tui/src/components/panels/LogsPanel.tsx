import type { Event } from "@adlr/sdk";
import { createClient, DAEMON_SESSION_ID } from "@adlr/sdk";
import { useBindings } from "@opentui/keymap/react";
import { useEffect, useState } from "react";
import type { PanelProps } from "../../core/types";
import { Theme } from "../../theme";
import { LogLine } from "../LogLine";
import { SelectList } from "../SelectList";

function isEvent(x: unknown): x is Event {
	return (
		typeof x === "object" &&
		x !== null &&
		"id" in x &&
		"session_id" in x &&
		"type" in x &&
		"timestamp" in x
	);
}

export function LogsPanel({ state, width, height }: PanelProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">(
		"all",
	);
	const [autoScroll, setAutoScroll] = useState(true);
	const [logsView, setLogsView] = useState<"session" | "daemon">("session");
	const [daemonEvents, setDaemonEvents] = useState<Event[]>([]);

	useEffect(() => {
		const client = createClient();
		let cleanup: (() => void) | undefined;
		(async () => {
			try {
				const unsub = await client.subscribe(DAEMON_SESSION_ID, (msg) => {
					if (msg.type === "snapshot") {
						setDaemonEvents(msg.payload.events ?? []);
					} else if (msg.type === "event") {
						const ev = msg.payload;
						if (isEvent(ev)) {
							setDaemonEvents((prev) => [ev, ...prev]);
						}
					}
				});
				cleanup = unsub;
			} catch {
				// Daemon events are best-effort
			}
		})();
		return () => {
			cleanup?.();
			client.close();
		};
	}, []);

	const events = logsView === "daemon" ? daemonEvents : state.events;
	const filtered = events.filter((e) => {
		if (filter === "all") return true;
		const level = e.type.startsWith("log.info")
			? "info"
			: e.type.startsWith("log.warn")
				? "warn"
				: e.type.startsWith("log.error")
					? "error"
					: "other";
		return level === filter;
	});
	const display = filtered.slice(0, 50);
	const safeIndex = Math.min(selectedIndex, display.length - 1);

	useEffect(() => {
		if (autoScroll && display.length > 0) {
			setSelectedIndex(display.length - 1);
		}
	}, [autoScroll, display.length]);

	useBindings(
		() => ({
			commands: [
				{
					name: "logs:toggle-source",
					run() {
						setLogsView((v) => (v === "session" ? "daemon" : "session"));
						setSelectedIndex(0);
					},
				},
				{
					name: "logs:filter-info",
					run() {
						setFilter("info");
						setSelectedIndex(0);
					},
				},
				{
					name: "logs:filter-warn",
					run() {
						setFilter("warn");
						setSelectedIndex(0);
					},
				},
				{
					name: "logs:filter-error",
					run() {
						setFilter("error");
						setSelectedIndex(0);
					},
				},
				{
					name: "logs:toggle-scroll",
					run() {
						setAutoScroll((a) => !a);
					},
				},
				{
					name: "logs:up",
					run() {
						setSelectedIndex((i) => Math.max(0, i - 1));
					},
				},
				{
					name: "logs:down",
					run() {
						setSelectedIndex((i) =>
							Math.max(0, Math.min(display.length - 1, i + 1)),
						);
					},
				},
			],
			bindings: [
				{ key: "d", cmd: "logs:toggle-source" },
				{ key: "i", cmd: "logs:filter-info" },
				{ key: "w", cmd: "logs:filter-warn" },
				{ key: "e", cmd: "logs:filter-error" },
				{ key: "f", cmd: "logs:toggle-scroll" },
				{ key: "up", cmd: "logs:up" },
				{ key: "down", cmd: "logs:down" },
			],
		}),
		[display.length],
	);

	return (
		<box style={{ flexDirection: "column", width, height }}>
			<box style={{ height: 1, marginBottom: 1 }}>
				<text>
					<b>View: </b>
				</text>
				<text fg={logsView === "session" ? Theme.primary : Theme.info}>
					{logsView === "session" ? "[Session]" : "[Daemon]"}
				</text>
				<text fg="#666"> d=toggle i/w/e=filter f=autoscroll</text>
			</box>
			<box style={{ flexDirection: "column", flexGrow: 1, overflow: "hidden" }}>
				<SelectList<Event>
					items={display}
					selectedIndex={safeIndex}
					height={Math.max(1, height - 2)}
					renderItem={(event, _i, isSelected) => (
						<LogLine event={event} isSelected={isSelected} width={width} />
					)}
				/>
			</box>
		</box>
	);
}
