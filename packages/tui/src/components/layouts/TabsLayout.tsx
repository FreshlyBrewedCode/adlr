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
    <box style={{ flexDirection: "column", width, height }}>
      {tabPosition === "top" && (
        <box style={{ height: 1, flexDirection: "row" }}>
          {childArray.map((_, i) => {
            const title = childNodes ? getPanelTitle(childNodes[i]) : String(i + 1)
            const isActive = i === activeIndex
            return (
              <box key={i} style={{ marginRight: 2 }}>
                <text fg={isActive ? Theme.primary : Theme.muted}>
                  {isActive ? <b>{"▸ "}{i + 1}: {title}</b> : <>{"  "}{i + 1}: {title}</>}
                </text>
              </box>
            )
          })}
        </box>
      )}
      <box style={{ flexGrow: 1 }}>
        {childArray[activeIndex]}
      </box>
      {tabPosition === "bottom" && (
        <box style={{ height: 1, flexDirection: "row" }}>
          {childArray.map((_, i) => {
            const title = childNodes ? getPanelTitle(childNodes[i]) : String(i + 1)
            const isActive = i === activeIndex
            return (
              <box key={i} style={{ marginRight: 2 }}>
                <text fg={isActive ? Theme.primary : Theme.muted}>
                  {isActive ? <b>{"▸ "}{i + 1}: {title}</b> : <>{"  "}{i + 1}: {title}</>}
                </text>
              </box>
            )
          })}
        </box>
      )}
    </box>
  )
}
