import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { ConfigLoader } from "../src/config-loader"
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

function createTestDir(): string {
  const dir = join(tmpdir(), `adler-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe("ConfigLoader", () => {
  let loader: ConfigLoader
  let testDir: string

  beforeEach(() => {
    loader = new ConfigLoader()
    testDir = createTestDir()
  })

  afterEach(() => {
    loader.close()
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  test("returns empty config when no config files exist", async () => {
    const config = await loader.loadConfig(testDir)
    expect(config).toEqual({})
  })

  test("loads project config", async () => {
    const adlerDir = join(testDir, ".adler")
    mkdirSync(adlerDir, { recursive: true })
    writeFileSync(
      join(adlerDir, "adler.ts"),
      `export default { agent: { agents: { test: { interactive: true } } } }`,
      "utf-8"
    )

    const config = await loader.loadConfig(testDir)
    expect(config.agent?.agents?.test).toEqual({ interactive: true })
  })

  test("caches config on second load", async () => {
    const adlerDir = join(testDir, ".adler")
    mkdirSync(adlerDir, { recursive: true })
    writeFileSync(
      join(adlerDir, "adler.ts"),
      `export default { agent: { agents: { test: { interactive: true } } } }`,
      "utf-8"
    )

    const config1 = await loader.loadConfig(testDir)
    const config2 = await loader.loadConfig(testDir)
    expect(config1).toBe(config2)
  })

  test("invalidates cache and reloads on file change", async () => {
    const adlerDir = join(testDir, ".adler")
    mkdirSync(adlerDir, { recursive: true })
    writeFileSync(
      join(adlerDir, "adler.ts"),
      `export default { agent: { agents: { test: { interactive: true } } } }`,
      "utf-8"
    )

    const config1 = await loader.loadConfig(testDir)
    expect(config1.agent?.agents?.test).toEqual({ interactive: true })

    // Manually invalidate to simulate file change
    loader.invalidate(testDir)

    writeFileSync(
      join(adlerDir, "adler.ts"),
      `export default { agent: { agents: { test: { interactive: false } } } }`,
      "utf-8"
    )

    const config2 = await loader.loadConfig(testDir)
    expect(config2.agent?.agents?.test).toEqual({ interactive: false })
  })

  test("close clears all watchers and cache", async () => {
    const adlerDir = join(testDir, ".adler")
    mkdirSync(adlerDir, { recursive: true })
    writeFileSync(
      join(adlerDir, "adler.ts"),
      `export default { agent: { agents: { test: { interactive: true } } } }`,
      "utf-8"
    )

    await loader.loadConfig(testDir)
    loader.close()

    // After close, should reload from disk
    const config = await loader.loadConfig(testDir)
    expect(config.agent?.agents?.test).toEqual({ interactive: true })
  })
})
