import type { PanelProps } from "../../core/types"
import { Theme } from "../../theme"
import { StatusBadge } from "../StatusBadge"

export function OverviewPanel({ state, width, height }: PanelProps) {
  const recentAgents = state.spans
    .filter(s => s.kind === "agent")
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, 5)

  return (
    <box style={{ flexDirection: "row", width, height }}>
      <box style={{ flexDirection: "column", width: "50%" }}>
        <text><b>Session</b></text>
        <text>Status: {state.session?.status}</text>
        <text>Working dir: {state.session?.working_dir}</text>
        <box style={{ marginTop: 1 }}>
          <text><b>Recent Agents</b></text>
        </box>
        {recentAgents.map(a => (
          <box key={a.id}>
            <StatusBadge status={a.status} />
            <text> {a.name}</text>
          </box>
        ))}
      </box>
      <box style={{ flexDirection: "column", width: "50%" }}>
        <text><b>Context</b></text>
        {state.context.map(item => (
          <box key={item.id}>
            <text fg={Theme.type[item.type as keyof typeof Theme.type] ?? Theme.muted}>
              {item.type}
            </text>
            <text> {item.label ?? "—"}</text>
          </box>
        ))}
      </box>
    </box>
  )
}
