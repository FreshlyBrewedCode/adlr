import { PanelRegistry } from "../core/PanelRegistry"
import { Theme } from "../theme"

export function HelpModal({ onClose }: { onClose: () => void }) {
  const panels = PanelRegistry.getAll()
  return (
    <box
      border={true}
      borderStyle={"rounded"}
      borderColor={Theme.primary}
      padding={1}
      width={60}
      maxHeight={10}
      overflow="scroll"
      shouldFill={true}
      backgroundColor={Theme.background}
    >
      <box
        flexDirection={"column"}
        width={60}
      >
        <text content="HOTKEYS" />
        <box flexDirection={"column"} marginTop={1} >
          <text content="--- GLOBAL ---" />
          <text content="tab / shift+tab — next / prev focus" />
          <text content="q / ctrl+c — quit" />
          <text content="? — toggle help" />
        </box>
        {panels.map(panel => (
          <box key={panel.id} flexDirection={"column"} marginTop={1}>
            <text content={`--- ${panel.title.toUpperCase()} ---`} />
            {panel.hotkeys?.map(hk => (
              <text key={hk.key} content={`${hk.key} — ${hk.description}`} />
            ))}
          </box>
        ))}
      </box></box>
  )
}
