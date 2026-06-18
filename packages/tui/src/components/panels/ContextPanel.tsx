import type { ContextItem } from "@adler/sdk";
import { useBindings } from "@opentui/keymap/react";
import { useMemo, useState } from "react";
import type { PanelProps } from "../../core/types";
import { Theme } from "../../theme";
import { SelectList } from "../SelectList";
import { TypeBadge } from "../TypeBadge";

export function ContextPanel({ state, width, height }: PanelProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const grouped = useMemo(() => {
		return state.context.reduce<Record<string, ContextItem[]>>((acc, item) => {
			acc[item.type] = acc[item.type] ?? [];
			acc[item.type].push(item);
			return acc;
		}, {});
	}, [state.context]);

	const itemIndexMap = useMemo(() => {
		const map = new Map<string, number>();
		let index = 0;
		Object.entries(grouped).forEach(([_, items]) => {
			for (const item of items) {
				map.set(item.id, index++);
			}
		});
		return map;
	}, [grouped]);

	useBindings(
		() => ({
			commands: [
				{
					name: "context:up",
					run() {
						setSelectedIndex((i) => Math.max(0, i - 1));
					},
				},
				{
					name: "context:down",
					run() {
						setSelectedIndex((i) =>
							Math.max(0, Math.min(state.context.length - 1, i + 1)),
						);
					},
				},
			],
			bindings: [
				{ key: "up", cmd: "context:up" },
				{ key: "down", cmd: "context:down" },
			],
		}),
		[state.context.length],
	);

	return (
		<box style={{ flexDirection: "column", width, height }}>
			{Object.entries(grouped).map(([type, items]) => (
				<box key={type} style={{ flexDirection: "column", marginTop: 1 }}>
					<box style={{ flexDirection: "row" }}>
						<TypeBadge type={type} />
						<text fg="#666"> {items.length} items</text>
					</box>
					<SelectList<ContextItem>
						items={items}
						selectedIndex={selectedIndex}
						renderItem={(contextItem, _i, _isSelected) => {
							const isItemSelected =
								(itemIndexMap.get(contextItem.id) ?? -1) === selectedIndex;
							const valueText = String(
								contextItem.value?.text ??
									contextItem.value?.url ??
									contextItem.value?.path ??
									JSON.stringify(contextItem.value),
							);
							const typeColor =
								Theme.type[contextItem.type as keyof typeof Theme.type] ??
								Theme.muted;
							return (
								<box
									style={{
										backgroundColor: isItemSelected ? Theme.muted : undefined,
									}}
								>
									<text fg={typeColor}>│ </text>
									<text>{valueText}</text>
									<text fg="#666">
										{" "}
										{contextItem.label} {contextItem.description}
									</text>
								</box>
							);
						}}
					/>
				</box>
			))}
		</box>
	);
}
