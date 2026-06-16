import type { TreeNode } from "./types"
import { PanelRegistry } from "./PanelRegistry"
import { LayoutRegistry } from "./LayoutRegistry"

export function validateLayout(node: TreeNode): string[] {
  const errors: string[] = []

  if (node.type === "panel") {
    if (!PanelRegistry.get(node.id)) {
      errors.push(`Unknown panel: ${node.id}`)
    }
    return errors
  }

  const layout = LayoutRegistry.get(node.layout)
  if (!layout) {
    errors.push(`Unknown layout: ${node.layout}`)
    return errors
  }

  if (node.children.length === 0) {
    errors.push(`Layout ${node.layout} must have at least one child`)
  }

  if (node.layout === "split" && node.children.length !== 2) {
    errors.push(`Split layout must have exactly 2 children, got ${node.children.length}`)
  }

  for (const child of node.children) {
    errors.push(...validateLayout(child))
  }

  return errors
}
