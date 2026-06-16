import type { TreeNode, PanelNode, LayoutNode } from "./types"
import { PanelRegistry } from "./PanelRegistry"
import { LayoutRegistry } from "./LayoutRegistry"

export function validateLayout(node: TreeNode): string[] {
  const errors: string[] = []

  if ("panel" in node) {
    const panelNode = node as PanelNode
    if (!PanelRegistry.get(panelNode.panel)) {
      errors.push(`Unknown panel: ${panelNode.panel}`)
    }
    return errors
  }

  const layoutNode = node as LayoutNode
  const layout = LayoutRegistry.get(layoutNode.layout)
  if (!layout) {
    errors.push(`Unknown layout: ${layoutNode.layout}`)
    return errors
  }

  if (layoutNode.content.length === 0) {
    errors.push(`Layout ${layoutNode.layout} must have at least one child`)
  }

  if (layoutNode.layout === "split" && layoutNode.content.length !== 2) {
    errors.push(`Split layout must have exactly 2 children, got ${layoutNode.content.length}`)
  }

  for (const child of layoutNode.content) {
    errors.push(...validateLayout(child as TreeNode))
  }

  return errors
}
