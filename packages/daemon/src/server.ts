import { createServer, type Socket } from "net"
import type { Storage } from "@adler/sdk"
import { SOCKET_PATH } from "@adler/sdk"
import { ProcessManager } from "./process-manager"
import { handleCommand } from "./handlers"
import type { InactivityTimer } from "./lifecycle"

export function startServer(storage: Storage, getProcessManager: () => ProcessManager, inactivity: InactivityTimer): { close: () => void; broadcast: (sessionId: string, event: { type: string; payload: unknown }) => void } {
  const subscribers = new Map<string, Set<{ write: (data: string) => void }>>()
  const clients = new Set<Socket>()

  function broadcast(sessionId: string, event: { type: string; payload: unknown }) {
    const set = subscribers.get(sessionId)
    if (set) {
      const data = JSON.stringify({ type: "event", event: event.type, payload: event.payload }) + "\n"
      for (const client of set) {
        try { client.write(data) } catch {}
      }
    }
  }

  const ctx = {
    storage,
    get processManager() { return getProcessManager() },
    subscribers,
    broadcast,
  }

  const server = createServer((socket) => {
    clients.add(socket)
    inactivity.addClient()

    let buffer = ""
    let subscribedSessionId: string | null = null
    let subscriberEntry: { write: (data: string) => void } | null = null
    let rawMode = false
    let attachedSpanId: string | null = null

    socket.on("data", async (data) => {
      if (rawMode && attachedSpanId) {
        const agent = getProcessManager().getAgent(attachedSpanId)
        if (agent) {
          agent.pty.write(data.toString())
        }
        return
      }

      buffer += data.toString()
      let lines: string[]
      while ((lines = buffer.split("\n")).length > 1) {
        buffer = lines.pop()!
        for (const line of lines) {
          if (!line) continue
          try {
            const msg = JSON.parse(line) as { type: string; id: string; payload: unknown }

            if (msg.type === "subscribe") {
              const { session_id } = msg.payload as { session_id: string }
              subscribedSessionId = session_id
              const set = subscribers.get(session_id) ?? new Set()
              subscriberEntry = { write: (d: string) => socket.write(d) }
              set.add(subscriberEntry)
              subscribers.set(session_id, set)

              const snapshot = await handleCommand(ctx, "subscribe", { session_id })
              socket.write(JSON.stringify({ type: "response", id: msg.id, payload: snapshot }) + "\n")
              continue
            }

            if (msg.type === "agent.attach") {
              const { span_id } = msg.payload as { span_id: string }
              const cleanup = getProcessManager().addAttachListener(span_id, (data) => {
                socket.write(data)
              })
              socket.on("close", () => {
                cleanup()
                rawMode = false
                attachedSpanId = null
              })
              rawMode = true
              attachedSpanId = span_id
              socket.write(JSON.stringify({ type: "response", id: msg.id, payload: { attached: true } }) + "\n")
              continue
            }

            const result = await handleCommand(ctx, msg.type, msg.payload)
            socket.write(JSON.stringify({ type: "response", id: msg.id, payload: result }) + "\n")
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            // Try to parse id from malformed line
            let id = "unknown"
            try {
              const parsed = JSON.parse(line)
              id = parsed.id ?? "unknown"
            } catch {}
            socket.write(JSON.stringify({ type: "error", id, error }) + "\n")
          }
        }
      }
    })

    socket.on("close", () => {
      clients.delete(socket)
      inactivity.removeClient()
      if (subscribedSessionId && subscriberEntry) {
        const set = subscribers.get(subscribedSessionId)
        if (set) {
          set.delete(subscriberEntry)
        }
      }
    })
  })

  server.listen(SOCKET_PATH)

  return {
    close() {
      for (const client of clients) {
        client.end()
      }
      server.close()
    },
    broadcast,
  }
}
