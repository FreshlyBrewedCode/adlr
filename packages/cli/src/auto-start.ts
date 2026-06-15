import { connect } from "node:net"
import { spawn } from "node:child_process"
import { existsSync, unlinkSync } from "node:fs"
import { setTimeout } from "node:timers/promises"
import { SOCKET_PATH } from "@adler/sdk"

const DAEMON_START_TIMEOUT_MS = 5000
const DAEMON_POLL_INTERVAL_MS = 100

async function canConnect(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(socketPath)
    socket.on("connect", () => { socket.end(); resolve(true) })
    socket.on("error", () => { resolve(false) })
  })
}

export async function ensureDaemon(): Promise<void> {
  if (existsSync(SOCKET_PATH)) {
    if (await canConnect(SOCKET_PATH)) {
      return
    }
    unlinkSync(SOCKET_PATH)
  }

  const daemonPath = new URL("../../daemon/src/index.ts", import.meta.url).pathname
  const proc = spawn(process.execPath, [daemonPath], {
    detached: true,
    stdio: ["ignore", "ignore", "pipe"],
  })
  proc.unref()

  let spawnError: Error | null = null
  let exitCode: number | null = null
  let exitSignal: string | null = null
  let stderrOutput = ""

  proc.stderr?.on("data", (chunk: Buffer) => {
    stderrOutput += chunk.toString()
  })

  proc.on("error", (err) => {
    spawnError = err
  })

  proc.on("exit", (code, signal) => {
    if (code !== 0 && code !== null) {
      exitCode = code
    } else if (signal) {
      exitSignal = signal
    }
  })

  const start = Date.now()
  while (Date.now() - start < DAEMON_START_TIMEOUT_MS) {
    await setTimeout(DAEMON_POLL_INTERVAL_MS)

    if (spawnError) {
      throw spawnError
    }
    if (exitCode !== null) {
      const detail = stderrOutput.trim()
      const msg = detail
        ? `Daemon exited with code ${exitCode}:\n${detail}`
        : `Daemon exited with code ${exitCode}`
      throw new Error(msg)
    }
    if (exitSignal !== null) {
      const detail = stderrOutput.trim()
      const msg = detail
        ? `Daemon was killed by signal ${exitSignal}:\n${detail}`
        : `Daemon was killed by signal ${exitSignal}`
      throw new Error(msg)
    }
    if (await canConnect(SOCKET_PATH)) {
      return
    }
  }
  const detail = stderrOutput.trim()
  const msg = detail
    ? `Daemon failed to start within 5 seconds:\n${detail}`
    : "Daemon failed to start within 5 seconds"
  throw new Error(msg)
}
