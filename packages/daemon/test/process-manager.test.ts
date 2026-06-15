import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { SQLiteStorage } from "@adler/sdk"
import { ProcessManager } from "../src/process-manager"
import { ConfigLoader } from "../src/config-loader"
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

function createTestDir(): string {
  const dir = join(tmpdir(), `adler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe("ProcessManager", () => {
  let storage: SQLiteStorage
  let loader: ConfigLoader
  let testDir: string

  beforeEach(() => {
    storage = new SQLiteStorage(":memory:")
    loader = new ConfigLoader()
    testDir = createTestDir()
  })

  afterEach(() => {
    loader.close()
    storage.close()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("uses ConfigLoader with session working_dir", async () => {
    const adlerDir = join(testDir, ".adler")
    mkdirSync(adlerDir, { recursive: true })
    writeFileSync(
      join(adlerDir, "adler.ts"),
      `export default { agent: { agents: { test: { run: () => "echo hello" } } } }`,
      "utf-8"
    )

    const pm = new ProcessManager(storage, loader, () => {})
    const session = await storage.createSession({ working_dir: testDir })

    try {
      await pm.spawnAgent({
        sessionId: session.id,
        agentType: "test",
        prompt: "hello",
        name: "test-agent",
      })
    } catch (e) {
      // Agent may fail to run because "sh -c echo hello" isn't a real agent,
      // but it should NOT fail with "Unknown agent type"
      expect((e as Error).message).not.toContain("Unknown agent type")
    }
  })

  test("rejects unknown agent type from session directory", async () => {
    const pm = new ProcessManager(storage, loader, () => {})
    const session = await storage.createSession({ working_dir: testDir })

    expect(
      pm.spawnAgent({
        sessionId: session.id,
        agentType: "nonexistent",
        prompt: "hello",
        name: "test-agent",
      })
    ).rejects.toThrow("Unknown agent type: nonexistent")
  })
})
