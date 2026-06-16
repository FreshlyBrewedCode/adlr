import { Box, Text } from "ink"
import type { Event } from "@adler/sdk"

function levelFromType(type: string): "info" | "warn" | "error" | "other" {
  if (type.startsWith("log.info")) return "info"
  if (type.startsWith("log.warn")) return "warn"
  if (type.startsWith("log.error")) return "error"
  return "other"
}

const LEVEL_COLORS: Record<string, string> = {
  info: "green",
  warn: "yellow",
  error: "red",
  other: "white",
}

export function LogsTab({
  events,
  selectedIndex,
  filter,
  logsView,
}: {
  events: Event[]
  selectedIndex: number
  filter: "all" | "info" | "warn" | "error"
  logsView: "session" | "daemon"
}) {
  const filtered = events.filter(e => {
    if (filter === "all") return true
    return levelFromType(e.type) === filter
  })

  const display = filtered.slice(0, 50)
  const safeIndex = Math.min(selectedIndex, display.length - 1)

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>View: </Text>
        <Text color={logsView === "session" ? "cyan" : "magenta"}>
          {logsView === "session" ? "[Session]" : "[Daemon]"}
        </Text>
        <Text dimColor>  d=toggle  i/w/e=filter  f=autoscroll</Text>
      </Box>
      {display.map((event, i) => {
        const isSelected = i === safeIndex
        const level = levelFromType(event.type)
        const message = typeof event.data?.message === 'string' ? event.data.message : JSON.stringify(event.data)
        return (
          <Box key={event.id} borderStyle={isSelected ? "single" : undefined}>
            <Text dimColor>{new Date(event.timestamp).toLocaleTimeString()}</Text>
            <Text color={LEVEL_COLORS[level]}> {level.toUpperCase()}</Text>
            <Text> {event.type}</Text>
            <Text dimColor> {message}</Text>
          </Box>
        )
      })}
    </Box>
  )
}
