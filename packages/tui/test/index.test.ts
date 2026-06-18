import { test, expect, mock, beforeEach, afterEach } from "bun:test"

// Set session env before any module is imported
process.env.ADLER_SESSION = "test-session"

// Mock OpenTUI before import
const mockRenderer = {
  destroy: mock(() => {}),
  on: mock(() => {}),
  isDestroyed: false,
}

const mockRoot = {
  render: mock(() => {}),
}

mock.module("@opentui/core", () => ({
  createCliRenderer: mock(async () => mockRenderer),
}))

mock.module("@opentui/react", () => ({
  createRoot: mock(() => mockRoot),
}))

mock.module("../src/keymap.ts", () => ({
  createAdlerKeymap: mock(() => ({})),
}))

mock.module("../src/loadConfig.ts", () => ({
  loadConfig: mock(async () => ({})),
}))

mock.module("../src/app.tsx", () => ({
  default: () => null,
}))

mock.module("@adler/sdk", () => ({
  resolveSessionId: mock(() => "test-session"),
}))

beforeEach(() => {
  process.env.ADLER_SESSION = "test-session"
  mockRenderer.destroy.mockClear()
  mockRoot.render.mockClear()
})

afterEach(() => {
  delete process.env.ADLER_SESSION
})

test("runTui creates a renderer in alternate-screen mode", async () => {
  const { runTui } = await import("../src/index.ts")
  await runTui()
  const { createCliRenderer } = await import("@opentui/core")
  expect(createCliRenderer).toHaveBeenCalledWith(
    expect.objectContaining({ screenMode: "alternate-screen" }),
  )
})

test("runTui renders App into the root", async () => {
  const { runTui } = await import("../src/index.ts")
  await runTui()
  expect(mockRoot.render).toHaveBeenCalled()
})

test("runTui returns a cleanup function that destroys the renderer", async () => {
  const { runTui } = await import("../src/index.ts")
  const cleanup = await runTui()
  expect(typeof cleanup).toBe("function")
  cleanup()
  expect(mockRenderer.destroy).toHaveBeenCalled()
})
