import type { ReactNode } from "react";
import { Theme } from "../theme";

export function SelectList<T>({
	items,
	selectedIndex,
	renderItem,
	height,
}: {
	items: T[];
	selectedIndex: number;
	renderItem: (item: T, index: number, isSelected: boolean) => ReactNode;
	height?: number;
}) {
	return (
		<scrollbox style={{ height, overflow: "scroll" }}>
			{items.map((item, i) => {
				const isSelected = i === selectedIndex;
				return (
					<box
						key={String(i)}
						style={{ backgroundColor: isSelected ? Theme.muted : undefined }}
					>
						{renderItem(item, i, isSelected)}
					</box>
				);
			})}
		</scrollbox>
	);
}
