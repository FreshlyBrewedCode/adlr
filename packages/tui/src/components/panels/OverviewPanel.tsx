import { Box, Text } from "ink"
import type { PanelProps } from "../../core/types"

export function OverviewPanel({ state, width, height }: PanelProps) {
  const recentAgents = state.spans
    .filter(s => s.kind === "agent")
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, 5)

  return (
    <Box flexDirection="row" width={width} height={height}>
      <Box flexDirection="column" width="50%">
        <Text bold>Session</Text>
        <Text>Status: {state.session?.status}</Text>
        <Text>Working dir: {state.session?.working_dir}</Text>
        <Box marginTop={1}>
          <Text bold>Recent Agents</Text>
        </Box>
        {recentAgents.map(a => (
          <Box key={a.id}>
            <Text color={a.status === "done" ? "green" : a.status === "failed" ? "red" : "yellow"}>
              ● {" "}
            </Text>
            <Text>{a.name} ({a.status})</Text>
          </Box>
        ))}
      </Box>
      <Box flexDirection="column" width="50%">
        <Text bold>Context</Text>
        {state.context.map(item => (
          <Box key={item.id}>
            <Text color={item.type === "goal" ? "green" : item.type === "url" ? "blue" : "white"}>
              {item.type}
            </Text>
            <Text> {item.label ?? "—"}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
