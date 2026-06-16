import { Box } from "ink"
import type { ReactNode } from "react"
import { Theme } from "../theme"

export function SelectList({
  items,
  selectedIndex,
  renderItem,
}: {
  items: unknown[]
  selectedIndex: number
  renderItem: (item: unknown, index: number, isSelected: boolean) => ReactNode
}) {
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Box key={i} backgroundColor={i === selectedIndex ? Theme.muted : undefined}>
          {renderItem(item, i, i === selectedIndex)}
        </Box>
      ))}
    </Box>
  )
}
