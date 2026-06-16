import { useState } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"
import type { PanelProps } from "../../core/types"

function formatDuration(started: number, finished: number | null): string {
  const ms = (finished ?? Date.now()) - started
  if (ms < 1000) return `${ms}ms`
  return `${Math.floor(ms / 1000)}s`
}

export function AgentsPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const agents = state.spans.filter(s => s.kind === "agent")

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.max(0, Math.min(agents.length - 1, i + 1)))
    } else if (key.return) {
      const agent = agents[selectedIndex]
      if (agent) {
        // TODO: attach or read output
      }
    }
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      {agents.map((span, i) => {
        const isSelected = i === selectedIndex
        const duration = formatDuration(span.started_at, span.finished_at)
        return (
          <Box key={span.id} borderStyle={isSelected ? "single" : undefined}>
            <Text color={span.status === "done" ? "green" : span.status === "failed" ? "red" : span.status === "blocked" ? "yellow" : "blue"}>
              ● {" "}
            </Text>
            <Text>{String(span.data?.agent_type ?? "")} </Text>
            <Text dimColor>{String(span.data?.prompt ?? "").slice(0, 40)}… </Text>
            <Text>{duration}</Text>
            {span.data?.exit_code !== null && span.data?.exit_code !== undefined && (
              <Text> exit:{String(span.data.exit_code)}</Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
