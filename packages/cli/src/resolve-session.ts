import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export function resolveSessionId(options: { session?: string }): string | undefined {
  if (options.session) {
    return options.session
  }

  if (process.env.ADLER_SESSION) {
    return process.env.ADLER_SESSION
  }

  const sessionFile = join(process.cwd(), ".adler", ".session")
  try {
    if (existsSync(sessionFile)) {
      return readFileSync(sessionFile, "utf-8").trim()
    }
  } catch {
    // ignore file I/O errors
  }

  return undefined
}
