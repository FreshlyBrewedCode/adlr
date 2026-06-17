import { render } from "ink"
import React from "react"
import { App } from "./app"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { loadConfig } from "./loadConfig"

const ENTER_ALT_SCREEN = "\x1b[?1049h"
const LEAVE_ALT_SCREEN = "\x1b[?1049l"

let altScreenSetup = false

// exported for testing only
export function _resetAltScreenForTesting(): void {
  process.removeAllListeners("exit")
  process.removeAllListeners("SIGINT")
  process.removeAllListeners("SIGTERM")
  altScreenSetup = false
}

function resolveSessionId(): string | undefined {
  if (process.env.ADLER_SESSION) return process.env.ADLER_SESSION
  const localFile = join(process.cwd(), ".adler", ".session")
  if (existsSync(localFile)) {
    return readFileSync(localFile, "utf-8").trim()
  }
  return undefined
}

export async function runTui(): Promise<void> {
  const sessionId = resolveSessionId()
  if (!sessionId) {
    console.error("No active session. Run `adler new` first.")
    process.exit(1)
  }

  const config = await loadConfig(process.cwd())
  const layout = config.tui?.layout

  process.stdout.write(ENTER_ALT_SCREEN)

  if (!altScreenSetup) {
    altScreenSetup = true

    process.on("exit", () => {
      process.stdout.write(LEAVE_ALT_SCREEN)
    })

    process.on("SIGINT", () => {
      process.exit(0)
    })

    process.on("SIGTERM", () => {
      process.exit(0)
    })
  }

  const { waitUntilExit } = render(React.createElement(App, { sessionId, layout }))
  await waitUntilExit()
}
