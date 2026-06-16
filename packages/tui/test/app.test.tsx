import { describe, test, expect, beforeEach, mock } from "bun:test"
import React from "react"
import { render } from "ink-testing-library"
import { App } from "../src/app"
import { PanelRegistry } from "../src/core/PanelRegistry"
import { LayoutRegistry } from "../src/core/LayoutRegistry"
import { registerPanels } from "../src/components/panels"
import { registerLayouts } from "../src/components/layouts"

mock.module("@adler/sdk", () => ({
  createClient: () => ({
    subscribe: () => Promise.resolve(() => {}),
    close: () => {},
    on: () => () => {},
    env: () => ({ sessionId: undefined, spanId: undefined, socketPath: "" }),
    session: { create: () => Promise.resolve({}), list: () => Promise.resolve([]) },
    agent: { run: () => Promise.resolve({}), wait: () => Promise.resolve({}), status: () => Promise.resolve({}), list: () => Promise.resolve([]), attach: () => Promise.resolve() },
    span: { update: () => Promise.resolve() },
    context: { add: () => Promise.resolve({}), list: () => Promise.resolve([]) },
  }),
  DAEMON_SESSION_ID: "daemon",
}))

describe("App", () => {
  beforeEach(() => {
    PanelRegistry.clear()
    LayoutRegistry.clear()
    registerPanels()
    registerLayouts()
  })

  test("renders default layout with all panels", () => {
    const { lastFrame } = render(<App sessionId="test-123" />)
    const frame = lastFrame()
    expect(frame).toContain("adler")
    expect(frame).toContain("Overview")
  })

  test("renders footer with help hint", () => {
    const { lastFrame } = render(<App sessionId="test-123" />)
    expect(lastFrame()).toContain("? help")
    expect(lastFrame()).toContain("q quit")
  })
})
