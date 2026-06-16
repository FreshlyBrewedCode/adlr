import { describe, test, expect, beforeEach } from "bun:test"
import React from "react"
import { render } from "ink-testing-library"
import { LayoutRenderer } from "../../src/core/LayoutRenderer"
import { PanelRegistry } from "../../src/core/PanelRegistry"
import { LayoutRegistry } from "../../src/core/LayoutRegistry"
import { registerPanels } from "../../src/components/panels"
import { registerLayouts } from "../../src/components/layouts"
import { initialState } from "../../src/types"

describe("LayoutRenderer", () => {
  beforeEach(() => {
    PanelRegistry.clear()
    LayoutRegistry.clear()
    registerPanels()
    registerLayouts()
  })

  test("renders panel node", () => {
    const node = { panel: "overview" }
    const { lastFrame } = render(
      <LayoutRenderer
        node={node}
        state={initialState}
        dispatch={() => {}}
        width={80}
        height={24}
        focusPath={[]}
        onFocusChange={() => {}}
      />
    )
    expect(lastFrame()).toContain("Session")
  })

  test("renders layout node with children", () => {
    const node = {
      layout: "tabs",
      content: [
        { panel: "overview" }
      ]
    }
    const { lastFrame } = render(
      <LayoutRenderer
        node={node}
        state={initialState}
        dispatch={() => {}}
        width={80}
        height={24}
        focusPath={[0]}
        onFocusChange={() => {}}
      />
    )
    expect(lastFrame()).toContain("Session")
  })

  test("renders error for unknown panel", () => {
    const node = { panel: "unknown" }
    const { lastFrame } = render(
      <LayoutRenderer
        node={node}
        state={initialState}
        dispatch={() => {}}
        width={80}
        height={24}
        focusPath={[]}
        onFocusChange={() => {}}
      />
    )
    expect(lastFrame()).toContain("Unknown panel")
  })

  test("renders error for unknown layout", () => {
    const node = {
      layout: "unknown",
      content: []
    }
    const { lastFrame } = render(
      <LayoutRenderer
        node={node}
        state={initialState}
        dispatch={() => {}}
        width={80}
        height={24}
        focusPath={[]}
        onFocusChange={() => {}}
      />
    )
    expect(lastFrame()).toContain("Unknown layout")
  })

  test("propagates dimensions through split layout", () => {
    const node = {
      layout: "split",
      ratio: 0.5,
      direction: "horizontal",
      content: [
        { panel: "overview" },
        { panel: "agents" }
      ]
    }
    const { lastFrame } = render(
      <LayoutRenderer
        node={node}
        state={initialState}
        dispatch={() => {}}
        width={80}
        height={24}
        focusPath={[0]}
        onFocusChange={() => {}}
      />
    )
    expect(lastFrame()).toContain("Session")
    expect(lastFrame()).toContain("Recent Agents")
  })
})
