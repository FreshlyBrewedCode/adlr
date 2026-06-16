import type { TreeNode } from "./types"

interface LayoutPrimitives {
  Layout: (props: any) => TreeNode
  Panel: (props: any) => TreeNode
}

export function evaluateLayout(
  layoutFn: (primitives: LayoutPrimitives) => TreeNode
): TreeNode {
  const Layout = (props: any): TreeNode => ({
    type: "layout",
    layout: props.type,
    props: Object.fromEntries(
      Object.entries(props).filter(([k]) => k !== "type" && k !== "children")
    ),
    children: props.children ?? []
  })

  const Panel = (props: any): TreeNode => ({
    type: "panel",
    id: props.id
  })

  return layoutFn({ Layout, Panel })
}
