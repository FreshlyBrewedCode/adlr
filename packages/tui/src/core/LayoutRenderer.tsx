import { Box, Text } from "ink"
import type { TreeNode, LayoutNode, PanelNode } from "./types"
import { PanelRegistry } from "./PanelRegistry"
import { LayoutRegistry } from "./LayoutRegistry"
import { PanelChrome } from "../components/PanelChrome"
import { Theme } from "../theme"
import type { AppState, AppAction } from "../types"
import React from "react"
import { computeChildSize } from "./splitUtils"

interface LayoutRendererProps {
  node: TreeNode
  state: AppState
  dispatch: React.Dispatch<AppAction>
  width: number
  height: number
  focusPath: number[]
  onFocusChange: (path: number[]) => void
  currentPath?: number[]
}

export function LayoutRenderer({
  node,
  state,
  dispatch,
  width,
  height,
  focusPath,
  onFocusChange,
  currentPath = [],
}: LayoutRendererProps) {
  if ("panel" in node) {
    const panelNode = node as PanelNode
    const panel = PanelRegistry.get(panelNode.panel)
    if (!panel) {
      return (
        <Box width={width} height={height}>
          <Text color={Theme.error}>Unknown panel: {panelNode.panel}</Text>
        </Box>
      )
    }
    const isFocused =
      currentPath.length === focusPath.length &&
      currentPath.every((val, idx) => val === focusPath[idx])
    // PanelChrome consumes: 2 border rows + 2 padding rows + 1 title row = 5 rows
    // PanelChrome consumes: 2 border cols + 2 padding cols each side = 4 cols
    const innerHeight = Math.max(1, height - 5)
    const innerWidth = Math.max(1, width - 4)
    return (
      <PanelChrome
        title={panel.title}
        width={width}
        height={height}
        isFocused={isFocused}
      >
        <panel.component state={state} dispatch={dispatch} width={innerWidth} height={innerHeight} />
      </PanelChrome>
    )
  }

  const layoutNode = node as LayoutNode
  const layout = LayoutRegistry.get(layoutNode.layout)
  if (!layout) {
    return (
      <Box width={width} height={height}>
          <Text color={Theme.error}>Unknown layout: {layoutNode.layout}</Text>
      </Box>
    )
  }

  const { layout: _layout, content: _content, ...layoutProps } = layoutNode

  const children = layoutNode.content.map((child, i) => {
    let childWidth = width
    let childHeight = height

    if (layoutNode.layout === "tabs") {
      // Tabs layout has a 1-row tab bar
      childHeight = Math.max(1, height - 1)
    } else if (layoutNode.layout === "split") {
      const direction = layoutNode.direction === "vertical" ? "vertical" : "horizontal"
      const count = layoutNode.content.length
      const ratio = layoutNode.ratio
      if (direction === "horizontal") {
        childWidth = computeChildSize(width, count, i, ratio)
      } else {
        childHeight = computeChildSize(height, count, i, ratio)
      }
    }

    return (
      <LayoutRenderer
        key={i}
        node={child as TreeNode}
        state={state}
        dispatch={dispatch}
        width={childWidth}
        height={childHeight}
        focusPath={focusPath.slice(1)}
        onFocusChange={(subPath) => onFocusChange([i, ...subPath])}
        currentPath={[...currentPath, i]}
      />
    )
  })

  return (
    <layout.component
      layoutProps={layoutProps}
      width={width}
      height={height}
      state={state}
      dispatch={dispatch}
      focusPath={focusPath}
      onFocusChange={onFocusChange}
      childNodes={layoutNode.content}
    >
      {children}
    </layout.component>
  )
}
