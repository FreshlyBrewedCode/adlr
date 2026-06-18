# TUI Fullscreen Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the TUI to the terminal's alternate screen buffer on launch and restore the main buffer on exit, giving a clean vim-like fullscreen experience.

**Architecture:** Write two ANSI escape codes (`\x1b[?1049h` / `\x1b[?1049l`) around Ink's `render()` call in `runTui()`. Register `process.on('exit')` for unconditional cleanup and `process.on('SIGINT')` / `process.on('SIGTERM')` to ensure `exit` fires on graceful signals.

**Tech Stack:** Bun, TypeScript, Ink v7, ink-testing-library, bun:test

---

### Task 1: Add alternate screen buffer support to `runTui()`

**Files:**
- Modify: `packages/tui/src/index.ts`
- Test: `packages/tui/test/index.test.ts` (create)

- [ ] **Step 1: Create the test file**

Create `packages/tui/test/index.test.ts` with this content:

```typescript
import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from "bun:test"

// Mock ink's render before importing runTui
const mockWaitUntilExit = mock(() => Promise.resolve())
const mockRender = mock(() => ({ waitUntilExit: mockWaitUntilExit }))

mock.module("ink", () => ({ render: mockRender }))
mock.module("react", () => ({ createElement: mock(() => null), default: { createElement: mock(() => null) } }))
mock.module("../src/app", () => ({ App: () => null }))
mock.module("../src/loadConfig", () => ({
  loadConfig: mock(() => Promise.resolve({ tui: undefined })),
}))

import { runTui } from "../src/index"

describe("runTui", () => {
  let originalEnv: string | undefined
  let writtenBytes: string[]
  let originalWrite: typeof process.stdout.write

  beforeEach(() => {
    originalEnv = process.env.ADLR_SESSION
    process.env.ADLR_SESSION = "test-session-123"
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
      process.env.ADLR_SESSION = originalEnv
    } else {
      delete process.env.ADLR_SESSION
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

  test("registers SIGINT handler", async () => {
    const before = process.listeners("SIGINT").length
    await runTui()
    const after = process.listeners("SIGINT").length
    expect(after).toBeGreaterThan(before)
  })

  test("registers SIGTERM handler", async () => {
    const before = process.listeners("SIGTERM").length
    await runTui()
    const after = process.listeners("SIGTERM").length
    expect(after).toBeGreaterThan(before)
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd packages/tui && bun test test/index.test.ts
```

Expected: All 5 tests FAIL (escape code not written, no signal handlers registered).

- [ ] **Step 3: Implement the changes in `runTui()`**

Replace the contents of `packages/tui/src/index.ts` with:

```typescript
import { render } from "ink"
import React from "react"
import { App } from "./app"
import { readFileSync, existsSync } from "fs"
import { join } from "path"
import { loadConfig } from "./loadConfig"

const ENTER_ALT_SCREEN = "\x1b[?1049h"
const LEAVE_ALT_SCREEN = "\x1b[?1049l"

function resolveSessionId(): string | undefined {
  if (process.env.ADLR_SESSION) return process.env.ADLR_SESSION
  const localFile = join(process.cwd(), ".adlr", ".session")
  if (existsSync(localFile)) {
    return readFileSync(localFile, "utf-8").trim()
  }
  return undefined
}

export async function runTui(): Promise<void> {
  const sessionId = resolveSessionId()
  if (!sessionId) {
    console.error("No active session. Run `adlr new` first.")
    process.exit(1)
  }

  const config = await loadConfig(process.cwd())
  const layout = config.tui?.layout

  process.stdout.write(ENTER_ALT_SCREEN)

  process.on("exit", () => {
    process.stdout.write(LEAVE_ALT_SCREEN)
  })

  process.on("SIGINT", () => {
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    process.exit(0)
  })

  const { waitUntilExit } = render(React.createElement(App, { sessionId, layout }))
  await waitUntilExit()
}
```

- [ ] **Step 4: Run the new tests to confirm they pass**

```bash
cd packages/tui && bun test test/index.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd packages/tui && bun test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/index.ts packages/tui/test/index.test.ts
git commit -m "feat(tui): implement fullscreen alternate screen buffer mode"
```
