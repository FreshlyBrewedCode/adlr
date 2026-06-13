import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { connect } from "net"
import { SQLiteStorage } from "@adler/sdk"
import { startServer } from "../src/server"
import { ProcessManager } from "../src/process-manager"
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
    pm = new ProcessManager(storage, {}, () => {})
    inactivity = new InactivityTimer(() => {})
    server = startServer(storage, () => pm, inactivity)
    // Wait for socket to be ready
    await new Promise(r => setTimeout(r, 100))
  })

  afterEach(() => {
    server.close()
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
})
