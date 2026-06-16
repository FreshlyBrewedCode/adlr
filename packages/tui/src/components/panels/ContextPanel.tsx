import { useState, useMemo } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"
import type { ContextItem } from "@adler/sdk"
import type { PanelProps } from "../../core/types"
import { TypeBadge } from "../TypeBadge"

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

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.max(0, Math.min(state.context.length - 1, i + 1)))
    }
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      {Object.entries(grouped).map(([type, items]) => (
        <Box key={type} flexDirection="column" marginTop={1}>
          <TypeBadge type={type} />
          <Text dimColor> {items.length} items</Text>
          {items.map(item => {
            const isSelected = (itemIndexMap.get(item.id) ?? -1) === selectedIndex
            const valueText = item.value?.text ?? item.value?.url ?? item.value?.path ?? JSON.stringify(item.value)
            return (
              <Box key={item.id} borderStyle={isSelected ? "single" : undefined}>
                <Text color={type === "goal" ? "green" : type === "url" ? "blue" : "white"}>│ </Text>
                <Text>{valueText}</Text>
                <Text dimColor> {item.label} {item.description}</Text>
              </Box>
            )
          })}
        </Box>
      ))}
    </Box>
  )
}
