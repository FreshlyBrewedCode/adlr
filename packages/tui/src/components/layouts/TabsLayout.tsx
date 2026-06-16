import { Box, Text } from "ink"
import type { LayoutProps } from "../../core/types"

export function TabsLayout({
  layoutProps,
  children,
  width,
  height,
  focusPath,
  onFocusChange: _onFocusChange,
  state: _state,
  dispatch: _dispatch,
}: LayoutProps) {
  const activeIndex = focusPath[0] ?? 0
  const tabPosition = (layoutProps.tabPosition as "top" | "bottom") ?? "top"
  const childArray = Array.isArray(children) ? children : [children]

  return (
    <Box flexDirection="column" width={width} height={height}>
      {tabPosition === "top" && (
        <Box height={1} flexDirection="row">
          {childArray.map((_, i) => (
            <Text key={i} bold={i === activeIndex} color={i === activeIndex ? "blue" : undefined}>
              [{i + 1}]{" "}
            </Text>
          ))}
        </Box>
      )}
      <Box flexGrow={1} overflow="hidden">
        {childArray[activeIndex]}
      </Box>
      {tabPosition === "bottom" && (
        <Box height={1} flexDirection="row">
          {childArray.map((_, i) => (
            <Text key={i} bold={i === activeIndex} color={i === activeIndex ? "blue" : undefined}>
              [{i + 1}]{" "}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
