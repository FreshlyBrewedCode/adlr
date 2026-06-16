import { describe, test, expect } from "bun:test"
import type { PanelDefinition, LayoutDefinition, TreeNode } from "../../src/core/types"

describe("core types", () => {
  test("PanelDefinition has required fields", () => {
    const panel: PanelDefinition = {
      id: "test",
      title: "Test",
      component: () => null,
      hotkeys: [{ key: "a", description: "do a" }]
    }
    expect(panel.id).toBe("test")
    expect(panel.hotkeys?.[0].key).toBe("a")
  })

  test("LayoutNode has correct structure", () => {
    const node: TreeNode = {
      type: "layout",
      layout: "tabs",
      props: { tabPosition: "top" },
      children: [{ type: "panel", id: "overview" }]
    }
    expect(node.type).toBe("layout")
    expect(node.layout).toBe("tabs")
  })
})
