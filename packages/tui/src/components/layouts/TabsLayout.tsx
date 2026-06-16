import { Box, Text } from "ink"
import { PanelRegistry } from "../../core/PanelRegistry"
import { Theme } from "../../theme"
import type { LayoutProps, ContentNode } from "../../core/types"

function getPanelTitle(node: ContentNode): string {
  if (typeof node === "string") {
    return PanelRegistry.get(node)?.title ?? node
  }
  if ("panel" in node) {
    return PanelRegistry.get((node as { panel: string }).panel)?.title ?? (node as { panel: string }).panel
  }
  return "?"
}

export function TabsLayout({
  layoutProps,
  children,
  width,
  height,
  focusPath,
  childNodes,
}: LayoutProps) {
  const activeIndex = focusPath[0] ?? 0
  const tabPosition = (layoutProps.tabPosition as "top" | "bottom") ?? "top"
  const childArray = Array.isArray(children) ? children : [children]

  return (
    <Box flexDirection="column" width={width} height={height}>
      {tabPosition === "top" && (
        <Box height={1} flexDirection="row">
          {childArray.map((_, i) => {
            const title = childNodes ? getPanelTitle(childNodes[i]) : String(i + 1)
            const isActive = i === activeIndex
            return (
              <Box key={i} marginRight={2}>
                <Text
                  bold={isActive}
                  color={isActive ? Theme.primary : Theme.muted}
                >
                  {isActive ? "▸ " : "  "}{i + 1}: {title}
                </Text>
              </Box>
            )
          })}
        </Box>
      )}
      <Box flexGrow={1} overflow="hidden">
        {childArray[activeIndex]}
      </Box>
      {tabPosition === "bottom" && (
        <Box height={1} flexDirection="row">
          {childArray.map((_, i) => {
            const title = childNodes ? getPanelTitle(childNodes[i]) : String(i + 1)
            const isActive = i === activeIndex
            return (
              <Box key={i} marginRight={2}>
                <Text
                  bold={isActive}
                  color={isActive ? Theme.primary : Theme.muted}
                >
                  {isActive ? "▸ " : "  "}{i + 1}: {title}
                </Text>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}
