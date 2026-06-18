import type { ReactNode } from "react"
import { Theme } from "../theme"

export function SelectList({
  items,
  selectedIndex,
  renderItem,
  height,
}: {
  items: unknown[]
  selectedIndex: number
  renderItem: (item: unknown, index: number, isSelected: boolean) => ReactNode
  height?: number
}) {
  return (
    <scrollbox style={{ height, overflow: "scroll" }}>
      {items.map((item, i) => {
        const isSelected = i === selectedIndex
        return (
          <box key={i} style={{ backgroundColor: isSelected ? Theme.muted : undefined }}>
            {renderItem(item, i, isSelected)}
          </box>
        )
      })}
    </scrollbox>
  )
}
