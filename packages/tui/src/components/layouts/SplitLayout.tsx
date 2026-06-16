import { Box } from "ink"
import type { LayoutProps } from "../../core/types"

export function SplitLayout({
  layoutProps,
  children,
  width,
  height,
  focusPath: _focusPath,
  onFocusChange: _onFocusChange,
  state: _state,
  dispatch: _dispatch,
  childNodes: _childNodes,
}: LayoutProps) {
  const ratio = (layoutProps.ratio as number) ?? 0.5
  const direction = (layoutProps.direction as "horizontal" | "vertical") ?? "horizontal"
  const childArray = Array.isArray(children) ? children : [children]
  const [first, second] = childArray

  if (direction === "horizontal") {
    const firstWidth = Math.floor(width * ratio)
    const secondWidth = width - firstWidth
    return (
      <Box flexDirection="row" width={width} height={height}>
        <Box width={firstWidth} height={height} overflow="hidden">
          {first}
        </Box>
        <Box width={secondWidth} height={height} overflow="hidden">
          {second}
        </Box>
      </Box>
    )
  }

  const firstHeight = Math.floor(height * ratio)
  const secondHeight = height - firstHeight
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box width={width} height={firstHeight} overflow="hidden">
        {first}
      </Box>
      <Box width={width} height={secondHeight} overflow="hidden">
        {second}
      </Box>
    </Box>
  )
}
