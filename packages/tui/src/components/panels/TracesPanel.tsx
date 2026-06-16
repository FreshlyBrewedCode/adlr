import { useState, useMemo } from "react"
import { Box } from "ink"
import { useInput } from "ink"
import type { Span } from "@adler/sdk"
import type { PanelProps } from "../../core/types"
import { TreeNode } from "../TreeNode"

function buildChildrenMap(spans: Span[]): Map<string, Span[]> {
  const map = new Map<string, Span[]>()
  for (const span of spans) {
    if (span.parent_id !== null) {
      const list = map.get(span.parent_id) ?? []
      list.push(span)
      map.set(span.parent_id, list)
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.started_at - b.started_at)
  }
  return map
}

function flattenSpans(spans: Span[], selectedIndex: number): { span: Span; depth: number; isSelected: boolean }[] {
  const result: { span: Span; depth: number; isSelected: boolean }[] = []
  const childrenMap = buildChildrenMap(spans)
  const roots = spans.filter(s => s.parent_id === null).sort((a, b) => a.started_at - b.started_at)
  function walk(span: Span, depth: number) {
    const isSelected = result.length === selectedIndex
    result.push({ span, depth, isSelected })
    const children = childrenMap.get(span.id) ?? []
    for (const child of children) {
      walk(child, depth + 1)
    }
  }
  for (const root of roots) {
    walk(root, 0)
  }
  return result
}

export function TracesPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const flatList = useMemo(() => flattenSpans(state.spans, selectedIndex), [state.spans, selectedIndex])

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.max(0, Math.min(flatList.length - 1, i + 1)))
    } else if (key.return) {
      // TODO: toggle expansion
    }
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      {flatList.map(({ span, depth, isSelected }) => (
        <TreeNode key={span.id} span={span} depth={depth} isSelected={isSelected} />
      ))}
    </Box>
  )
}
