import { PanelRegistry } from "../core/PanelRegistry";
import { Theme } from "../theme";

export function HelpModal({ onClose: _onClose }: { onClose: () => void }) {
	const panels = PanelRegistry.getAll();
	return (
		<scrollbox
			border={true}
			borderStyle={"rounded"}
			borderColor={Theme.border}
			padding={1}
			width={60}
			maxHeight={20}
			overflow="scroll"
			shouldFill={true}
			backgroundColor={Theme.background}
			title="Hotkeys"
			titleColor={Theme.foreground}
		>
			<box style={{ flexDirection: "column", width: "100%", height: "auto" }}>
				<box style={{ flexDirection: "column" }}>
					<text content="--- GLOBAL ---" />
					<text content="tab / shift+tab — next / prev focus" />
					<text content="q / ctrl+c — quit" />
					<text content="? — toggle help" />
				</box>
				{panels.map((panel) => (
					<box key={panel.id} style={{ flexDirection: "column", marginTop: 1 }}>
						<text content={`--- ${panel.title.toUpperCase()} ---`} />
						{panel.hotkeys?.map((hk) => (
							<text key={hk.key} content={`${hk.key} — ${hk.description}`} />
						))}
					</box>
				))}
			</box>
		</scrollbox>
	);
}
