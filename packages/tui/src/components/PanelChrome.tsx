import { Box, Text } from "ink"
import { Theme } from "../theme"

export function PanelChrome({
  title,
  width,
  height,
  isFocused = false,
  children,
}: {
  title: string
  width: number
  height: number
  isFocused?: boolean
  children: React.ReactNode
}) {
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={isFocused ? Theme.panel.activeBorder : Theme.panel.border}
      padding={1}
    >
      <Text bold color={Theme.panel.title}>{title}</Text>
      {children}
    </Box>
  )
}
