import { Box, Text } from "ink"
import type { Span } from "@adler/sdk"

function formatDuration(started: number, finished: number | null): string {
  const ms = (finished ?? Date.now()) - started
  if (ms < 1000) return `${ms}ms`
  return `${Math.floor(ms / 1000)}s`
}

export function AgentsTab({ spans, selectedIndex }: { spans: Span[]; selectedIndex: number }) {
  const agents = spans.filter(s => s.kind === "agent")

  return (
    <Box flexDirection="column">
      {agents.map((span, i) => {
        const isSelected = i === selectedIndex
        const duration = formatDuration(span.started_at, span.finished_at)
        return (
          <Box key={span.id} borderStyle={isSelected ? "single" : undefined}>
            <Text color={span.status === "done" ? "green" : span.status === "failed" ? "red" : span.status === "blocked" ? "yellow" : "blue"}>
              ● {" "}
            </Text>
            <Text>{span.data?.agent_type as string} </Text>
            <Text dimColor>{(span.data?.prompt as string)?.slice(0, 40)}… </Text>
            <Text>{duration}</Text>
            {span.data?.exit_code !== null && span.data?.exit_code !== undefined && (
              <Text> exit:{span.data.exit_code}</Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
