import { Box, Text } from "ink"
import type { Event } from "@adler/sdk"

const LEVEL_COLORS: Record<string, string> = {
  info: "green",
  warn: "yellow",
  error: "red",
  other: "white",
}

function levelFromType(type: string): "info" | "warn" | "error" | "other" {
  if (type.startsWith("log.info")) return "info"
  if (type.startsWith("log.warn")) return "warn"
  if (type.startsWith("log.error")) return "error"
  return "other"
}

export function LogLine({ event, isSelected }: { event: Event; isSelected: boolean }) {
  const level = levelFromType(event.type)
  const message = (event.data?.message as string) ?? JSON.stringify(event.data)
  return (
    <Box borderStyle={isSelected ? "single" : undefined}>
      <Text dimColor>{new Date(event.timestamp).toLocaleTimeString()}</Text>
      <Text color={LEVEL_COLORS[level]}> {level.toUpperCase()}</Text>
      <Text> {event.type}</Text>
      <Text dimColor> {message}</Text>
    </Box>
  )
}
