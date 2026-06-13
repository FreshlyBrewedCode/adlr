import { Box, Text } from "ink"
import type { Session, Span, ContextItem } from "@adler/sdk"

export function OverviewTab({ session, spans, context }: { session: Session | null; spans: Span[]; context: ContextItem[] }) {
  const recentAgents = spans
    .filter(s => s.kind === "agent")
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, 5)

  return (
    <Box flexDirection="row" width="100%">
      <Box flexDirection="column" width="50%">
        <Text bold>Session</Text>
        <Text>Status: {session?.status}</Text>
        <Text>Working dir: {session?.working_dir}</Text>
        <Text bold marginTop={1}>Recent Agents</Text>
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
        {context.map(item => (
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
