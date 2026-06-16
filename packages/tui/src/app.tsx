import { useEffect, useReducer } from "react"
import { Box, useInput, useApp } from "ink"
import { createClient, type EventType, DAEMON_SESSION_ID } from "@adler/sdk"
import { initialState, reducer } from "./types"
import { Header } from "./components/Header"
import { Footer } from "./components/Footer"
import { HotkeyDialog } from "./components/HotkeyDialog"
import { OverviewTab } from "./components/OverviewTab"
import { ContextTab } from "./components/ContextTab"
import { AgentsTab } from "./components/AgentsTab"
import { TracesTab } from "./components/TracesTab"
import { LogsTab } from "./components/LogsTab"

export function App({ sessionId }: { sessionId: string }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { exit } = useApp()

  // Subscribe to session events
  useEffect(() => {
    const client = createClient()
    let cleanup: (() => void) | undefined

    ;(async () => {
      try {
        const unsub = await client.subscribe(sessionId, (msg) => {
          if (msg.type === "snapshot") {
            dispatch({ type: "snapshot", payload: msg.payload })
          } else if (msg.type === "event") {
            const payload = typeof msg.payload === 'object' && msg.payload !== null ? (msg.payload as Record<string, unknown>) : {}
            dispatch({
              type: "event",
              payload: {
                id: Date.now(),
                session_id: sessionId,
                span_id: typeof payload.span_id === 'string' ? payload.span_id : null,
                type: msg.event as EventType,
                data: payload,
                timestamp: Date.now(),
              },
            })
          }
        })
        cleanup = unsub
      } catch (err) {
        dispatch({
          type: "event",
          payload: {
            id: Date.now(),
            session_id: sessionId,
            span_id: null,
            type: "log.error",
            data: { message: String(err) },
            timestamp: Date.now(),
          },
        })
      }
    })()

    return () => {
      cleanup?.()
      client.close()
    }
  }, [sessionId])

  useInput((input, key) => {
    if (state.isHelpOpen) {
      if (input === "?" || key.escape) {
        dispatch({ type: "toggleHelp" })
      }
      return
    }

    if (input === "?") {
      dispatch({ type: "toggleHelp" })
      return
    }

    if (key.tab) {
      if (key.shift) {
        dispatch({ type: "prevTab" })
      } else {
        dispatch({ type: "nextTab" })
      }
      return
    }

    if (input === "q" || (key.ctrl && input === "c")) {
      exit()
      return
    }

    if (input >= "1" && input <= "5") {
      dispatch({ type: "setTab", tab: parseInt(input) - 1 })
      return
    }

    if (state.activeTab === 2) {
      // Agents tab
      const agents = state.spans.filter(s => s.kind === "agent")
      if (key.upArrow) {
        dispatch({ type: "selectAgent", index: Math.max(0, state.agentsSelectedIndex - 1) })
      } else if (key.downArrow) {
        dispatch({ type: "selectAgent", index: Math.max(0, Math.min(agents.length - 1, state.agentsSelectedIndex + 1)) })
      } else if (key.return) {
        const agent = agents[state.agentsSelectedIndex]
        if (agent) {
          // TODO: attach or read output
        }
      }
    } else if (state.activeTab === 3) {
      // Traces tab
      if (key.upArrow) {
        dispatch({ type: "selectTrace", index: Math.max(0, state.tracesSelectedIndex - 1) })
      } else if (key.downArrow) {
        dispatch({ type: "selectTrace", index: Math.max(0, Math.min(state.spans.length - 1, state.tracesSelectedIndex + 1)) })
      }
    } else if (state.activeTab === 4) {
      // Logs tab
      if (input === "d") {
        dispatch({ type: "toggleLogsView" })
      } else if (input === "i") {
        dispatch({ type: "setLogsFilter", filter: "info" })
      } else if (input === "w") {
        dispatch({ type: "setLogsFilter", filter: "warn" })
      } else if (input === "e") {
        dispatch({ type: "setLogsFilter", filter: "error" })
      } else if (input === "f") {
        dispatch({ type: "toggleLogsAutoScroll" })
      } else if (key.upArrow) {
        dispatch({ type: "selectLog", index: Math.max(0, state.logsSelectedIndex - 1) })
      } else if (key.downArrow) {
        dispatch({ type: "selectLog", index: Math.max(0, Math.min(state.events.length - 1, state.logsSelectedIndex + 1)) })
      }
    }
  })

  return (
    <Box flexDirection="column" height="100%">
      <Header session={state.session} />
      <Box flexGrow={1}>
        {state.activeTab === 0 && (
          <OverviewTab session={state.session} spans={state.spans} context={state.context} />
        )}
        {state.activeTab === 1 && (
          <ContextTab context={state.context} selectedIndex={0} />
        )}
        {state.activeTab === 2 && (
          <AgentsTab spans={state.spans} selectedIndex={state.agentsSelectedIndex} />
        )}
        {state.activeTab === 3 && (
          <TracesTab spans={state.spans} selectedIndex={state.tracesSelectedIndex} />
        )}
        {state.activeTab === 4 && (
          <LogsTab
            events={state.events}
            selectedIndex={state.logsSelectedIndex}
            filter={state.logsFilter}
            logsView={state.logsView}
          />
        )}
      </Box>
      {state.isHelpOpen && <HotkeyDialog />}
      <Footer activeTab={state.activeTab} />
    </Box>
  )
}
