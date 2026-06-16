import { useState, useMemo } from "react"
import { Box } from "ink"
import { useInput } from "ink"
import type { Span } from "@adler/sdk"
import type { PanelProps } from "../../core/types"
import { TreeNode } from "../TreeNode"

function buildTree(spans: Span[]): Span[] {
  return spans.filter(s => s.parent_id === null).sort((a, b) => a.started_at - b.started_at)
}

function getChildren(spans: Span[], parentId: string): Span[] {
  return spans.filter(s => s.parent_id === parentId).sort((a, b) => a.started_at - b.started_at)
}

function flattenSpans(spans: Span[], selectedIndex: number): { span: Span; depth: number; isSelected: boolean }[] {
  const result: { span: Span; depth: number; isSelected: boolean }[] = []
  function walk(span: Span, depth: number) {
    const isSelected = result.length === selectedIndex
    result.push({ span, depth, isSelected })
    getChildren(spans, span.id).forEach(child => walk(child, depth + 1))
  }
  buildTree(spans).forEach(span => walk(span, 0))
  return result
}

export function TracesPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const flatList = useMemo(() => flattenSpans(state.spans, selectedIndex), [state.spans, selectedIndex])

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.max(0, Math.min(state.spans.length - 1, i + 1)))
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
