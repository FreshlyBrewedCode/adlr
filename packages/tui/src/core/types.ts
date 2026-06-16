import type { AppState, AppAction } from "../types"
import type { ComponentType } from "react"

export interface HotkeyDefinition {
  key: string
  description: string
  handler?: (state: AppState, dispatch: React.Dispatch<AppAction>) => void
}

export interface PanelProps {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  width: number
  height: number
}

export interface PanelDefinition {
  id: string
  title: string
  description?: string
  component: ComponentType<PanelProps>
  hotkeys?: HotkeyDefinition[]
}

export interface LayoutNode {
  type: "layout"
  layout: string
  props: Record<string, unknown>
  children: TreeNode[]
}

export interface PanelNode {
  type: "panel"
  id: string
}

export type TreeNode = LayoutNode | PanelNode

export interface LayoutProps {
  layoutProps: Record<string, unknown>
  children: React.ReactNode
  width: number
  height: number
  state: AppState
  dispatch: React.Dispatch<AppAction>
  focusPath: number[]
  onFocusChange: (path: number[]) => void
}

export interface LayoutDefinition {
  id: string
  component: ComponentType<LayoutProps>
  defaultLayoutProps?: Record<string, unknown>
}
