import { useState, useMemo } from "react"
import { useBindings } from "@opentui/keymap/react"
import type { ContextItem } from "@adler/sdk"
import type { PanelProps } from "../../core/types"
import { TypeBadge } from "../TypeBadge"
import { Theme } from "../../theme"
import { SelectList } from "../SelectList"

export function ContextPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const grouped = useMemo(() => {
    return state.context.reduce<Record<string, ContextItem[]>>((acc, item) => {
      acc[item.type] = acc[item.type] ?? []
      acc[item.type].push(item)
      return acc
    }, {})
  }, [state.context])

  const itemIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    let index = 0
    Object.entries(grouped).forEach(([_, items]) => {
      items.forEach(item => {
        map.set(item.id, index++)
      })
    })
    return map
  }, [grouped])

  const flatItems = useMemo(() => {
    const result: ContextItem[] = []
    Object.values(grouped).forEach(items => {
      items.forEach(item => result.push(item))
    })
    return result
  }, [grouped])

  useBindings(
    () => ({
      commands: [
        { name: "context:up", run() { setSelectedIndex(i => Math.max(0, i - 1)) } },
        { name: "context:down", run() { setSelectedIndex(i => Math.max(0, Math.min(state.context.length - 1, i + 1))) } },
      ],
      bindings: [
        { key: "up", cmd: "context:up" },
        { key: "down", cmd: "context:down" },
      ],
    }),
    [state.context.length],
  )

  return (
    <box style={{ flexDirection: "column", width, height }}>
      {Object.entries(grouped).map(([type, items]) => (
        <box key={type} style={{ flexDirection: "column", marginTop: 1 }}>
          <box style={{ flexDirection: "row" }}>
            <TypeBadge type={type} />
            <text fg="#666"> {items.length} items</text>
          </box>
          <SelectList
            items={items}
            selectedIndex={selectedIndex}
            renderItem={(item, i, isSelected) => {
              const contextItem = item as ContextItem
              const isItemSelected = (itemIndexMap.get(contextItem.id) ?? -1) === selectedIndex
              const valueText = String(contextItem.value?.text ?? contextItem.value?.url ?? contextItem.value?.path ?? JSON.stringify(contextItem.value))
              const typeColor = Theme.type[contextItem.type as keyof typeof Theme.type] ?? Theme.muted
              return (
                <box>
                  <text fg={typeColor}>│ </text>
                  <text>{valueText}</text>
                  <text fg="#666"> {contextItem.label} {contextItem.description}</text>
                </box>
              )
            }}
          />
        </box>
      ))}
    </box>
  )
}
