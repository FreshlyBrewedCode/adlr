import { test, expect } from "bun:test"

test("@opentui/react is importable", async () => {
  const mod = await import("@opentui/react")
  expect(typeof mod.createRoot).toBe("function")
})

test("@opentui/core is importable", async () => {
  const mod = await import("@opentui/core")
  expect(typeof mod.createCliRenderer).toBe("function")
})

test("@opentui/keymap is importable", async () => {
  const mod = await import("@opentui/keymap")
  expect(typeof mod.Keymap).toBe("function")
})
