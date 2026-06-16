import { useState, useEffect } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"
import { createClient, DAEMON_SESSION_ID } from "@adler/sdk"
import type { Event } from "@adler/sdk"
import type { PanelProps } from "../../core/types"
import { LogLine } from "../LogLine"

function isEvent(x: unknown): x is Event {
  return (
    typeof x === "object" &&
    x !== null &&
    "id" in x &&
    "session_id" in x &&
    "type" in x &&
    "timestamp" in x
  )
}

export function LogsPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">("all")
  const [autoScroll, setAutoScroll] = useState(true)
  const [logsView, setLogsView] = useState<"session" | "daemon">("session")
  const [daemonEvents, setDaemonEvents] = useState<Event[]>([])

  useEffect(() => {
    const client = createClient()
    let cleanup: (() => void) | undefined
    ;(async () => {
      try {
        const unsub = await client.subscribe(DAEMON_SESSION_ID, (msg) => {
          if (msg.type === "snapshot") {
            setDaemonEvents(msg.payload.events ?? [])
          } else if (msg.type === "event") {
            const ev = msg.payload
            if (isEvent(ev)) {
              setDaemonEvents(prev => [ev, ...prev])
            }
          }
        })
        cleanup = unsub
      } catch {
        // Daemon events are best-effort
      }
    })()
    return () => {
      cleanup?.()
      client.close()
    }
  }, [])

  const events = logsView === "daemon" ? daemonEvents : state.events
  const filtered = events.filter(e => {
    if (filter === "all") return true
    const level = e.type.startsWith("log.info") ? "info" : e.type.startsWith("log.warn") ? "warn" : e.type.startsWith("log.error") ? "error" : "other"
    return level === filter
  })
  const display = filtered.slice(0, 50)
  const safeIndex = Math.min(selectedIndex, display.length - 1)

  // Auto-scroll to the latest log when new events arrive
  useEffect(() => {
    if (autoScroll && display.length > 0) {
      setSelectedIndex(display.length - 1)
    }
  }, [events.length, autoScroll, logsView, filter])

  useInput((input, key) => {
    if (input === "d") {
      setLogsView(v => v === "session" ? "daemon" : "session")
      setSelectedIndex(0)
    } else if (input === "i") {
      setFilter("info")
      setSelectedIndex(0)
    } else if (input === "w") {
      setFilter("warn")
      setSelectedIndex(0)
    } else if (input === "e") {
      setFilter("error")
      setSelectedIndex(0)
    } else if (input === "f") {
      setAutoScroll(a => !a)
    } else if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.max(0, Math.min(display.length - 1, i + 1)))
    }
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box height={1} marginBottom={1}>
        <Text bold>View: </Text>
        <Text color={logsView === "session" ? "cyan" : "magenta"}>
          {logsView === "session" ? "[Session]" : "[Daemon]"}
        </Text>
        <Text dimColor>  d=toggle  i/w/e=filter  f=autoscroll</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {display.map((event, i) => (
          <LogLine key={event.id} event={event} isSelected={i === safeIndex} />
        ))}
      </Box>
    </Box>
  )
}
