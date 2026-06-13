import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { resolveSessionId } from "../src/resolve-session"
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs"
import { join } from "node:path"

describe("CLI", () => {
  let oldSession: string | undefined

  beforeEach(() => {
    oldSession = process.env.ADLER_SESSION
    delete process.env.ADLER_SESSION
  })

  afterEach(() => {
    if (oldSession !== undefined) {
      process.env.ADLER_SESSION = oldSession
    } else {
      delete process.env.ADLER_SESSION
    }
  })

  test("resolveSessionId returns env var", () => {
    process.env.ADLER_SESSION = "env-sess"
    const id = resolveSessionId({})
    expect(id).toBe("env-sess")
  })

  test("resolveSessionId prefers explicit session argument over env var", () => {
    process.env.ADLER_SESSION = "env-sess"
    const id = resolveSessionId({ session: "flag-sess" })
    expect(id).toBe("flag-sess")
  })

  test("resolveSessionId reads .adler/.session file", () => {
    const sessionDir = join(process.cwd(), ".adler")
    const sessionFile = join(sessionDir, ".session")
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(sessionFile, " file-sess \n", "utf-8")
    try {
      const id = resolveSessionId({})
      expect(id).toBe("file-sess")
    } finally {
      unlinkSync(sessionFile)
      rmdirSync(sessionDir)
    }
  })

  test("resolveSessionId returns undefined when nothing set", () => {
    const id = resolveSessionId({})
    expect(id).toBeUndefined()
  })
})
