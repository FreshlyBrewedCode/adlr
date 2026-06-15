import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { connect } from "net"
import { SQLiteStorage } from "@adler/sdk"
import { startServer } from "../src/server"
import { ProcessManager } from "../src/process-manager"
import { ConfigLoader } from "../src/config-loader"
import { unlinkSync, existsSync, mkdirSync } from "fs"
import { dirname } from "path"
import { SOCKET_PATH } from "@adler/sdk"
import { InactivityTimer } from "../src/lifecycle"

describe("Daemon server", () => {
  let storage: SQLiteStorage
  let pm: ProcessManager
  let server: ReturnType<typeof startServer>
  let inactivity: InactivityTimer

  beforeEach(async () => {
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
    const socketDir = dirname(SOCKET_PATH)
    if (!existsSync(socketDir)) mkdirSync(socketDir, { recursive: true })
    storage = new SQLiteStorage(":memory:")
    pm = new ProcessManager(storage, new ConfigLoader(), () => {})
    inactivity = new InactivityTimer(() => {})
    server = startServer(storage, () => pm, inactivity)
    // Wait for socket to be ready
    await new Promise(r => setTimeout(r, 100))
  })

  afterEach(() => {
    server.close()
    pm.stop()
    inactivity.stop()
    storage.close()
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH)
  })

  test("session.create returns a session", async () => {
    const client = connect(SOCKET_PATH)
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve)
      client.once("error", reject)
    })

    const response = await new Promise<unknown>((resolve) => {
      let buffer = ""
      client.on("data", (data) => {
        buffer += data.toString()
        const lines = buffer.split("\n")
        if (lines.length > 1) {
          for (const line of lines) {
            if (line) {
              resolve(JSON.parse(line))
              return
            }
          }
        }
      })
      client.write(JSON.stringify({ type: "session.create", id: "req-1", payload: { working_dir: "/tmp" } }) + "\n")
    })

    expect(response).toHaveProperty("type", "response")
    expect(response).toHaveProperty("payload")
    const payload = (response as any).payload
    expect(payload).toHaveProperty("id")
    expect(payload.status).toBe("active")
    client.end()
  })

  test("session.list excludes __daemon__ session", async () => {
    // Create the daemon sentinel session
    storage.upsertDaemonSession()

    // Create a normal session
    const client = connect(SOCKET_PATH)
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve)
      client.once("error", reject)
    })

    // Create a normal session
    const createResponse = await new Promise<unknown>((resolve) => {
      let buffer = ""
      client.on("data", (data) => {
        buffer += data.toString()
        const lines = buffer.split("\n")
        if (lines.length > 1) {
          for (const line of lines) {
            if (line) {
              resolve(JSON.parse(line))
              return
            }
          }
        }
      })
      client.write(JSON.stringify({ type: "session.create", id: "req-create", payload: { working_dir: "/tmp" } }) + "\n")
    })
    const normalSessionId = (createResponse as any).payload.id

    // Now call session.list
    const listResponse = await new Promise<unknown>((resolve) => {
      let buffer = ""
      client.removeAllListeners("data")
      client.on("data", (data) => {
        buffer += data.toString()
        const lines = buffer.split("\n")
        if (lines.length > 1) {
          for (const line of lines) {
            if (line) {
              resolve(JSON.parse(line))
              return
            }
          }
        }
      })
      client.write(JSON.stringify({ type: "session.list", id: "req-list", payload: {} }) + "\n")
    })

    const sessions = (listResponse as any).payload as Array<{ id: string }>
    const ids = sessions.map(s => s.id)

    expect(ids).toContain(normalSessionId)
    expect(ids).not.toContain("__daemon__")

    client.end()
  })
})
