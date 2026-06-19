import type { AgentSpan, Span } from "@adlr/sdk";
import { useBindings } from "@opentui/keymap/react";
import { useState } from "react";
import type { PanelProps } from "../../core/types";
import { Card } from "../Card";
import { SelectList } from "../SelectList";

export function AgentsPanel({ state, width, height }: PanelProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const agents = state.spans.filter((s) => s.kind === "agent");

	useBindings(
		() => ({
			commands: [
				{
					name: "agents:up",
					run() {
						setSelectedIndex((i) => Math.max(0, i - 1));
					},
				},
				{
					name: "agents:down",
					run() {
						setSelectedIndex((i) =>
							Math.max(0, Math.min(agents.length - 1, i + 1)),
						);
					},
				},
				{
					name: "agents:select",
					run() {
						const agent = agents[selectedIndex];
						if (agent) {
							// TODO: attach or read output
						}
					},
				},
			],
			bindings: [
				{ key: "up", cmd: "agents:up" },
				{ key: "down", cmd: "agents:down" },
				{ key: "return", cmd: "agents:select" },
			],
		}),
		[agents.length, selectedIndex],
	);

	return (
		<box style={{ flexDirection: "column", width, height }}>
			<SelectList<Span>
				items={agents}
				selectedIndex={selectedIndex}
				renderItem={(span, _i, isSelected) => (
					<Card
						title={String((span as AgentSpan).data?.agent_type ?? span.name)}
						description={String((span as AgentSpan).data?.prompt ?? "").slice(
							0,
							40,
						)}
						status={span.status}
						hint={
							span.status === "running"
								? "enter → suspend TUI, stream live PTY"
								: "enter → replay stored PTY output"
						}
						isSelected={isSelected}
						width={width}
					/>
				)}
			/>
		</box>
	);
}
