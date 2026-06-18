import { PanelRegistry } from "../core/PanelRegistry"
import { Theme } from "../theme"

export function HelpModal({ onClose }: { onClose: () => void }) {
  const panels = PanelRegistry.getAll()
  return (
    <box
      style={{
        flexDirection: "column",
        border: true,
        borderStyle: "rounded",
        borderColor: Theme.primary,
        padding: 1,
        width: 60,
        height: 20,
      }}
    >
      <text fg={Theme.primary}><b>Hotkeys</b></text>
      <box style={{ flexDirection: "column", marginTop: 1 }}>
        <text><b><u>Global</u></b></text>
        <text>tab / shift+tab — next / prev focus</text>
        <text>q / ctrl+c — quit</text>
        <text>? — toggle help</text>
      </box>
      {panels.map(panel => (
        <box key={panel.id} style={{ marginTop: 1, flexDirection: "column" }}>
          <text fg={Theme.primary}><b><u>{panel.title}</u></b></text>
          {panel.hotkeys?.map(hk => (
            <text key={hk.key}>{`${hk.key} — ${hk.description}`}</text>
          ))}
        </box>
      ))}
    </box>
  )
}
