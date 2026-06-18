import { useState } from "react"
import { useBindings } from "@opentui/keymap/react"
import type { PanelProps } from "../../core/types"
import { Card } from "../Card"
import { SelectList } from "../SelectList"

function formatDuration(started: number, finished: number | null): string {
  const ms = (finished ?? Date.now()) - started
  if (ms < 1000) return `${ms}ms`
  return `${Math.floor(ms / 1000)}s`
}

export function AgentsPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const agents = state.spans.filter(s => s.kind === "agent")

  useBindings(
    () => ({
      commands: [
        { name: "agents:up", run() { setSelectedIndex(i => Math.max(0, i - 1)) } },
        { name: "agents:down", run() { setSelectedIndex(i => Math.max(0, Math.min(agents.length - 1, i + 1))) } },
        { name: "agents:select", run() {
          const agent = agents[selectedIndex]
          if (agent) {
            // TODO: attach or read output
          }
        }},
      ],
      bindings: [
        { key: "up", cmd: "agents:up" },
        { key: "down", cmd: "agents:down" },
        { key: "return", cmd: "agents:select" },
      ],
    }),
    [agents.length, selectedIndex],
  )

  return (
    <box style={{ flexDirection: "column", width, height }}>
      <SelectList
        items={agents}
        selectedIndex={selectedIndex}
        renderItem={(span, i, isSelected) => {
          const duration = formatDuration(span.started_at, span.finished_at)
          return (
            <Card
              title={String(span.data?.agent_type ?? span.name)}
              description={String(span.data?.prompt ?? "").slice(0, 40)}
              status={span.status as any}
              hint={
                span.status === "running"
                  ? "enter → suspend TUI, stream live PTY"
                  : "enter → replay stored PTY output"
              }
              isSelected={isSelected}
              width={width}
            />
          )
        }}
      />
    </box>
  )
}
