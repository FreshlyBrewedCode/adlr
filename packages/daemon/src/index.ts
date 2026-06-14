import { SQLiteStorage, DB_PATH } from "@adler/sdk"
import { startServer } from "./server"
import { ProcessManager } from "./process-manager"
import { loadConfig } from "./config-loader"
import { writePid, removePid, removeSocket, isDaemonRunning, InactivityTimer } from "./lifecycle"

async function main() {
  if (isDaemonRunning()) {
    console.error("Daemon is already running")
    process.exit(1)
  }

  const storage = new SQLiteStorage(DB_PATH)
  const config = await loadConfig()

  const inactivity = new InactivityTimer(() => {
    console.log("Shutting down due to inactivity")
    shutdown()
  })

  let processManager: ProcessManager

  const server = startServer(storage, () => processManager, inactivity)

  processManager = new ProcessManager(storage, config, (event) => {
    const payload = event.payload as Record<string, unknown> | undefined
    const sessionId = payload?.session_id as string | undefined
    if (sessionId) {
      server.broadcast(sessionId, event)
    }
  }, inactivity)

  writePid()

  function shutdown() {
    server.close()
    processManager.stop()
    inactivity.stop()
    storage.close()
    removePid()
    removeSocket()
    process.exit(0)
  }

  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)

  console.log("adlerd started")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
