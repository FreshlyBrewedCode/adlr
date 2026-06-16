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

export type ContentNode = LayoutNode | PanelNode | string

export interface LayoutNode {
  layout: string
  content: ContentNode[]
  [key: string]: unknown
}

export interface PanelNode {
  panel: string
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
  childNodes?: ContentNode[]
}

export interface LayoutDefinition {
  id: string
  component: ComponentType<LayoutProps>
  defaultLayoutProps?: Record<string, unknown>
}
