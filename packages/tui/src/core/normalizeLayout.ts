import type { ContentNode, LayoutNode, PanelNode, TreeNode } from "./types"

export function normalizeLayout(node: ContentNode): TreeNode {
  if (typeof node === "string") {
    return { panel: node }
  }
  if ("panel" in node) {
    return node as PanelNode
  }
  const layout = node as LayoutNode
  return {
    ...layout,
    content: layout.content.map(normalizeLayout)
  } as LayoutNode
}
