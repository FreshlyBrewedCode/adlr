import { Box } from "ink"
import type { LayoutProps } from "../../core/types"
import React from "react"
import { computeChildSize } from "../../core/splitUtils"

export function SplitLayout({
  layoutProps,
  children,
  width,
  height,
  focusPath: _focusPath,
  onFocusChange: _onFocusChange,
  state: _state,
  dispatch: _dispatch,
  childNodes,
}: LayoutProps) {
  const direction = (layoutProps.direction as "horizontal" | "vertical") ?? "horizontal"
  const ratio = layoutProps.ratio
  const childArray = Array.isArray(children) ? children : [children]
  const count = childNodes?.length || childArray.length

  if (direction === "horizontal") {
    return (
      <Box flexDirection="row" width={width} height={height}>
        {childArray.map((child, i) => (
          <Box key={i} width={computeChildSize(width, count, i, ratio)} height={height} overflow="hidden">
            {child}
          </Box>
        ))}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" width={width} height={height}>
      {childArray.map((child, i) => (
        <Box key={i} width={width} height={computeChildSize(height, count, i, ratio)} overflow="hidden">
          {child}
        </Box>
      ))}
    </Box>
  )
}
