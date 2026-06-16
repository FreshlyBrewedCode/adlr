import { describe, test, expect, beforeEach } from "bun:test"
import { validateLayout } from "../../src/core/validateLayout"
import { PanelRegistry } from "../../src/core/PanelRegistry"
import { LayoutRegistry } from "../../src/core/LayoutRegistry"
import { registerPanels } from "../../src/components/panels"
import { registerLayouts } from "../../src/components/layouts"

describe("validateLayout", () => {
  beforeEach(() => {
    PanelRegistry.clear()
    LayoutRegistry.clear()
    registerPanels()
    registerLayouts()
  })

  test("validates correct tree", () => {
    const tree = {
      type: "layout" as const,
      layout: "tabs",
      props: {},
      children: [
        { type: "panel" as const, id: "overview" }
      ]
    }
    expect(validateLayout(tree)).toEqual([])
  })

  test("detects unknown panel", () => {
    const tree = { type: "panel" as const, id: "unknown" }
    expect(validateLayout(tree)).toContain("Unknown panel: unknown")
  })

  test("detects split with wrong child count", () => {
    const tree = {
      type: "layout" as const,
      layout: "split",
      props: {},
      children: [
        { type: "panel" as const, id: "overview" }
      ]
    }
    expect(validateLayout(tree)).toContain("Split layout must have exactly 2 children, got 1")
  })
})
