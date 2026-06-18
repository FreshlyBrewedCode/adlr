import { Theme } from "../theme";

export function PanelChrome({
	title,
	width,
	height,
	isFocused = false,
	children,
}: {
	title: string;
	width: number;
	height: number;
	isFocused?: boolean;
	children: React.ReactNode;
}) {
	return (
		<box
			style={{
				border: true,
				borderStyle: "rounded",
				borderColor: isFocused ? Theme.panel.activeBorder : Theme.panel.border,
				flexDirection: "column",
				width,
				height,
				padding: 1,
			}}
			title={title}
		>
			{children}
		</box>
	);
}
