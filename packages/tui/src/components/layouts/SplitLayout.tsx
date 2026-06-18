import type { LayoutProps } from "../../core/types"
import React from "react"
import { computeChildSize } from "../../core/splitUtils"

export function SplitLayout({
  layoutProps,
  children,
  width,
  height,
  focusPath: _focusPath,
  onFocusChange: _onFocusChange,
  state: _state,
  dispatch: _dispatch,
  childNodes,
}: LayoutProps) {
  const direction = (layoutProps.direction as "horizontal" | "vertical") ?? "horizontal"
  const ratio = layoutProps.ratio
  const childArray = Array.isArray(children) ? children : [children]
  const count = childNodes?.length || childArray.length

  if (direction === "horizontal") {
    return (
      <box style={{ flexDirection: "row", width, height }}>
        {childArray.map((child, i) => (
          <box key={i} style={{ width: computeChildSize(width, count, i, ratio), height }}>
            {child}
          </box>
        ))}
      </box>
    )
  }

  return (
    <box style={{ flexDirection: "column", width, height }}>
      {childArray.map((child, i) => (
        <box key={i} style={{ width, height: computeChildSize(height, count, i, ratio) }}>
          {child}
        </box>
      ))}
    </box>
  )
}
