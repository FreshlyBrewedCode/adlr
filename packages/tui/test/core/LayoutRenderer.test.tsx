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
    const node = { type: "panel" as const, id: "overview" }
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
    expect(lastFrame()).toContain("Overview")
  })

  test("renders layout node with children", () => {
    const node = {
      type: "layout" as const,
      layout: "tabs",
      props: {},
      children: [
        { type: "panel" as const, id: "overview" }
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
    expect(lastFrame()).toContain("Overview")
  })

  test("renders error for unknown panel", () => {
    const node = { type: "panel" as const, id: "unknown" }
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
})
