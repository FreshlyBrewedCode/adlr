import { useEffect, useReducer, useState } from "react"
import { useTerminalDimensions, useRenderer } from "@opentui/react"
import { KeymapProvider, useBindings } from "@opentui/keymap/react"
import { createClient, type EventType, DAEMON_SESSION_ID, type AdlerConfig } from "@adler/sdk"
import { initialState, reducer } from "./types"
import { Header } from "./components/Header"
import { Footer } from "./components/Footer"
import { HelpModal } from "./components/HelpModal"
import { LayoutRenderer } from "./core/LayoutRenderer"
import { registerPanels } from "./components/panels"
import { registerLayouts } from "./components/layouts"
import type { ContentNode, TreeNode, PanelNode } from "./core/types"
import { normalizeLayout } from "./core/normalizeLayout"
import type { AdlerKeymap } from "./keymap"

const defaultLayout: ContentNode = {
  layout: "tabs",
  content: ["overview", "context", "agents", "traces", "logs"]
}

function resolveFocusedPanel(node: TreeNode, focusPath: number[]): string | null {
  if ("panel" in node) return (node as PanelNode).panel
  if (focusPath.length === 0) return null
  const childIndex = focusPath[0]
  const child = (node.content as TreeNode[])[childIndex]
  if (!child) return null
  return resolveFocusedPanel(child, focusPath.slice(1))
}

interface AppProps {
  sessionId: string
  layout?: ContentNode
  keymap: AdlerKeymap
  config?: AdlerConfig
}

function AppInner({ sessionId, layout: layoutProp }: Omit<AppProps, "keymap" | "config">) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [focusPath, setFocusPath] = useState<number[]>([0])
  const [layout] = useState<TreeNode>(() => normalizeLayout(layoutProp ?? defaultLayout))
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()

  useEffect(() => {
    registerPanels()
    registerLayouts()
  }, [])

  useEffect(() => {
    const client = createClient()
    let cleanup: (() => void) | undefined
    ;(async () => {
      try {
        const unsub = await client.subscribe(sessionId, (msg) => {
          if (msg.type === "snapshot") {
            dispatch({ type: "snapshot", payload: msg.payload })
          } else if (msg.type === "event") {
            dispatch({
              type: "event",
              payload: {
                id: Date.now(),
                session_id: sessionId,
                span_id: (msg.payload as any)?.span_id ?? null,
                type: msg.event as EventType,
                data: msg.payload as any,
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

  useEffect(() => {
    const client = createClient()
    let cleanup: (() => void) | undefined
    ;(async () => {
      try {
        const unsub = await client.subscribe(DAEMON_SESSION_ID, (msg) => {
          if (msg.type === "snapshot") {
            const snapshot = msg.payload as { session: any; spans: any[]; events: any[]; context: any[] }
            dispatch({ type: "daemonSnapshot", payload: snapshot.events ?? [] })
          } else if (msg.type === "event") {
            dispatch({
              type: "daemonEvent",
              payload: {
                id: Date.now(),
                session_id: DAEMON_SESSION_ID,
                span_id: null,
                type: msg.event as EventType,
                data: msg.payload as any,
                timestamp: Date.now(),
              },
            })
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

  useBindings(() => ({
    bindings: [
      {
        key: "?",
        cmd: () => {
          if (isHelpOpen) {
            setIsHelpOpen(false)
          } else {
            setIsHelpOpen(true)
          }
        },
      },
      {
        key: "escape",
        cmd: () => {
          if (isHelpOpen) {
            setIsHelpOpen(false)
          }
        },
      },
      {
        key: "q",
        cmd: () => {
          if (!isHelpOpen) {
            renderer.destroy()
          }
        },
      },
      {
        key: "ctrl+c",
        cmd: () => {
          renderer.destroy()
        },
      },
      {
        key: "tab",
        cmd: () => {
          if (!isHelpOpen) {
            setFocusPath(path => {
              if (path.length === 0) return [0]
              const newPath = [...path]
              newPath[0] = Math.min(4, newPath[0] + 1)
              return newPath
            })
          }
        },
      },
      {
        key: "shift+tab",
        cmd: () => {
          if (!isHelpOpen) {
            setFocusPath(path => {
              if (path.length === 0) return [0]
              const newPath = [...path]
              newPath[0] = Math.max(0, newPath[0] - 1)
              return newPath
            })
          }
        },
      },
    ],
  }), [isHelpOpen, renderer])

  const focusedPanel = resolveFocusedPanel(layout, focusPath)

  return (
    <box style={{ flexDirection: "column", width, height }}>
      <Header session={state.session} />
      <box style={{ flexGrow: 1, overflow: "hidden" }}>
        <LayoutRenderer
          node={layout}
          state={state}
          dispatch={dispatch}
          width={width}
          height={height - 2}
          focusPath={focusPath}
          onFocusChange={setFocusPath}
        />
      </box>
      {isHelpOpen && (
        <box style={{ position: "absolute", width, height, justifyContent: "center", alignItems: "center" }}>
          <HelpModal onClose={() => setIsHelpOpen(false)} />
        </box>
      )}
      <Footer focusedPanelId={focusedPanel} />
    </box>
  )
}

export default function App({ sessionId, layout, keymap }: AppProps) {
  return (
    <KeymapProvider keymap={keymap}>
      <AppInner sessionId={sessionId} layout={layout} />
    </KeymapProvider>
  )
}
