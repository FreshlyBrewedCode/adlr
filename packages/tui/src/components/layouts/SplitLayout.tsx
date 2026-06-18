import { computeChildSize } from "../../core/splitUtils";
import type { LayoutProps } from "../../core/types";

export function SplitLayout({
	layoutProps,
	children,
	width,
	height,
	focusPath: _focusPath,
	onFocusChange: _onFocusChange,
	state: _state,
	dispatch: _dispatch,
	childNodes,
}: LayoutProps) {
	const direction =
		(layoutProps.direction as "horizontal" | "vertical") ?? "horizontal";
	const ratio = layoutProps.ratio;
	const childArray = Array.isArray(children) ? children : [children];
	const count = childNodes?.length || childArray.length;

	if (direction === "horizontal") {
		return (
			<box style={{ flexDirection: "row", width, height }}>
				{childArray.map((child, i) => (
					<box
						key={String(i)}
						style={{ width: computeChildSize(width, count, i, ratio), height }}
					>
						{child}
					</box>
				))}
			</box>
		);
	}

	return (
		<box style={{ flexDirection: "column", width, height }}>
			{childArray.map((child, i) => (
				<box
					key={String(i)}
					style={{ width, height: computeChildSize(height, count, i, ratio) }}
				>
					{child}
				</box>
			))}
		</box>
	);
}
