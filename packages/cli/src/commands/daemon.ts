import { PID_FILE } from "@adler/sdk"
import { readFileSync, existsSync } from "node:fs"

export async function run(subcommand: string): Promise<void> {
  switch (subcommand) {
    case "stop": {
      if (!existsSync(PID_FILE)) {
        console.log("Daemon is not running")
        return
      }
      const raw = readFileSync(PID_FILE, "utf-8").trim()
      const pid = parseInt(raw, 10)
      if (Number.isNaN(pid)) {
        console.error("Corrupted PID file: not a valid number")
        return
      }
      try {
        process.kill(pid, "SIGTERM")
        console.log("Daemon stopped")
      } catch {
        console.error("Failed to stop daemon")
      }
      break
    }
    default:
      console.error(`Unknown daemon subcommand: ${subcommand}`)
      process.exit(1)
  }
}
