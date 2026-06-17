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

  if (layoutNode.layout === "split" && Array.isArray(layoutNode.ratio)) {
    const ratio = layoutNode.ratio as unknown[]
    if (ratio.some((r) => typeof r !== "number")) {
      errors.push(`Split layout ratio array must contain only numbers`)
    }
    if (ratio.length > layoutNode.content.length) {
      errors.push(
        `Split layout ratio array length (${ratio.length}) exceeds child count (${layoutNode.content.length})`,
      )
    }
  }

  for (const child of layoutNode.content) {
    errors.push(...validateLayout(child as TreeNode))
  }

  return errors
}
