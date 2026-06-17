import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

// Mock ink's render before importing runTui
const mockWaitUntilExit = mock(() => Promise.resolve())
const mockRender = mock(() => ({ waitUntilExit: mockWaitUntilExit }))

// ink uses jsxImportSource: "ink", so Bun tries to load ink/jsx-dev-runtime for .tsx files.
// These mocks must be registered before any dynamic import that loads .tsx files.
mock.module("ink/jsx-dev-runtime", () => ({ jsxDEV: () => null }))
mock.module("ink/jsx-runtime", () => ({ jsx: () => null, jsxs: () => null, Fragment: null }))
mock.module("ink", () => ({
  render: mockRender,
  Box: () => null,
  Text: () => null,
  useInput: mock(() => {}),
  useApp: mock(() => ({ exit: mock(() => {}) })),
  useStdout: mock(() => ({ stdout: process.stdout })),
}))
mock.module("@adler/sdk", () => ({
  createClient: () => ({
    subscribe: () => Promise.resolve(() => {}),
    close: () => {},
    on: () => () => {},
    env: () => ({ sessionId: undefined, spanId: undefined, socketPath: "" }),
    session: { create: () => Promise.resolve({}), list: () => Promise.resolve([]) },
    agent: {
      run: () => Promise.resolve({}),
      wait: () => Promise.resolve({}),
      status: () => Promise.resolve({}),
      list: () => Promise.resolve([]),
      attach: () => Promise.resolve(),
    },
    span: { update: () => Promise.resolve() },
    context: { add: () => Promise.resolve({}), list: () => Promise.resolve([]) },
  }),
  DAEMON_SESSION_ID: "daemon",
}))
mock.module("../src/loadConfig", () => ({
  loadConfig: mock(() => Promise.resolve({ tui: undefined })),
}))

// Dynamic import after mocks are registered, so Bun's module loader sees the mocks
// when resolving ink/jsx-dev-runtime from app.tsx
const { runTui, _resetAltScreenForTesting } = await import("../src/index")

describe("runTui", () => {
  let originalEnv: string | undefined
  let writtenBytes: string[]
  let originalWrite: typeof process.stdout.write

  beforeEach(() => {
    _resetAltScreenForTesting()
    originalEnv = process.env.ADLER_SESSION
    process.env.ADLER_SESSION = "test-session-123"
    writtenBytes = []
    originalWrite = process.stdout.write.bind(process.stdout)
    // Capture writes without actually writing to stdout
    process.stdout.write = ((chunk: string | Buffer) => {
      if (typeof chunk === "string") writtenBytes.push(chunk)
      return true
    }) as typeof process.stdout.write
    mockRender.mockClear()
    mockWaitUntilExit.mockClear()
  })

  afterEach(() => {
    process.stdout.write = originalWrite
    if (originalEnv !== undefined) {
      process.env.ADLER_SESSION = originalEnv
    } else {
      delete process.env.ADLER_SESSION
    }
  })

  test("writes enter-alt-screen escape code before rendering", async () => {
    await runTui()
    expect(writtenBytes[0]).toBe("\x1b[?1049h")
  })

  test("calls render after writing enter-alt-screen", async () => {
    await runTui()
    expect(mockRender).toHaveBeenCalledTimes(1)
  })

  test("registers exit handler that writes leave-alt-screen escape code", async () => {
    await runTui()
    // Simulate process exit event
    const exitListeners = process.listeners("exit")
    // Find our handler (it should have been registered during runTui)
    expect(exitListeners.length).toBeGreaterThan(0)
    // Invoke the last registered exit listener
    const handler = exitListeners[exitListeners.length - 1] as () => void
    writtenBytes = []
    handler()
    expect(writtenBytes[0]).toBe("\x1b[?1049l")
  })

  test("SIGINT handler calls process.exit(0)", async () => {
    const mockExit = spyOn(process, "exit").mockImplementation((() => {}) as any)
    await runTui()
    const listeners = process.listeners("SIGINT")
    const handler = listeners[listeners.length - 1] as () => void
    handler()
    expect(mockExit).toHaveBeenCalledWith(0)
    mockExit.mockRestore()
  })

  test("SIGTERM handler calls process.exit(0)", async () => {
    const mockExit = spyOn(process, "exit").mockImplementation((() => {}) as any)
    await runTui()
    const listeners = process.listeners("SIGTERM")
    const handler = listeners[listeners.length - 1] as () => void
    handler()
    expect(mockExit).toHaveBeenCalledWith(0)
    mockExit.mockRestore()
  })
})
