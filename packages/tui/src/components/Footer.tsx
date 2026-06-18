import { PanelRegistry } from "../core/PanelRegistry";
import { Theme } from "../theme";

export function Footer({ focusedPanelId }: { focusedPanelId: string | null }) {
	const panel = focusedPanelId ? PanelRegistry.get(focusedPanelId) : null;
	const hotkeys = [
		...(panel?.hotkeys?.map((h) => `${h.key} ${h.description}`) ?? []),
		"? help",
		"q quit",
	];
	return (
		<box
			style={{
				flexDirection: "row",
				height: 1,
				width: "100%",
				justifyContent: "space-between",
			}}
		>
			<box style={{ flexDirection: "row" }}>
				{hotkeys.map((hk, i) => (
					<box key={String(i)} style={{ marginRight: 1 }}>
						<text bg={Theme.footer.badgeBg} fg={Theme.footer.badgeText}>
							{" "}
							{hk}{" "}
						</text>
					</box>
				))}
			</box>
			<text fg="#666">{panel?.title ?? "No panel focused"}</text>
		</box>
	);
}
