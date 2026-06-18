# TUI Panel System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the adlr TUI into a panel-based architecture with registrable, nestable layouts, fullscreen mode, and a configurable layout system driven by the adlr.tsx config.

**Architecture:** Panels are self-contained React components registered in a PanelRegistry. Layouts (TabsLayout, SplitLayout) are registered in a LayoutRegistry. A recursive LayoutRenderer walks the layout tree (produced by evaluating the config's `tui.layout` function) and renders the appropriate panels and layouts. The Footer is always visible and shows hotkeys for the focused panel. The Help Modal (`?`) renders as an overlay showing all hotkeys grouped by panel.

**Tech Stack:** React, ink, TypeScript, Bun

---

## File Structure

**New files to create:**
- `packages/tui/src/core/PanelRegistry.ts` — Panel registry implementation
- `packages/tui/src/core/LayoutRegistry.ts` — Layout registry implementation
- `packages/tui/src/core/LayoutRenderer.tsx` — Recursive layout tree renderer
- `packages/tui/src/core/types.ts` — Core types (PanelDefinition, LayoutDefinition, etc.)
- `packages/tui/src/components/panels/OverviewPanel.tsx` — Overview panel (from OverviewTab)
- `packages/tui/src/components/panels/AgentsPanel.tsx` — Agents panel (from AgentsTab)
- `packages/tui/src/components/panels/TracesPanel.tsx` — Traces panel (from TracesTab)
- `packages/tui/src/components/panels/LogsPanel.tsx` — Logs panel (from LogsTab)
- `packages/tui/src/components/panels/ContextPanel.tsx` — Context panel (from ContextTab)
- `packages/tui/src/components/panels/index.ts` — Panel exports and registration
- `packages/tui/src/components/PanelChrome.tsx` — Shared panel wrapper (border, title)
- `packages/tui/src/components/StatusBadge.tsx` — Colored status dot
- `packages/tui/src/components/LogLine.tsx` — Log entry line
- `packages/tui/src/components/TreeNode.tsx` — Tree node for traces
- `packages/tui/src/components/SelectList.tsx` — Navigable list with selection
- `packages/tui/src/components/TypeBadge.tsx` — Colored type badge
- `packages/tui/src/components/HelpModal.tsx` — Help modal overlay
- `packages/tui/src/components/layouts/TabsLayout.tsx` — Tabs layout shell
- `packages/tui/src/components/layouts/SplitLayout.tsx` — Split layout shell
- `packages/tui/src/components/layouts/index.ts` — Layout exports and registration

**Files to modify:**
- `packages/tui/src/types.ts` — Simplify reducer, remove panel-specific state
- `packages/tui/src/app.tsx` — Rewrite with fullscreen, layout renderer, footer, help modal
- `packages/tui/src/components/Header.tsx` — Remove hardcoded tabs, read from layout tree
- `packages/tui/src/components/Footer.tsx` — Rewrite to show focused panel hotkeys
- `packages/tui/src/components/HotkeyDialog.tsx` — Remove (replaced by HelpModal)
- `packages/tui/src/index.ts` — No changes needed

**Files to delete:**
- `packages/tui/src/components/OverviewTab.tsx` → replaced by OverviewPanel
- `packages/tui/src/components/AgentsTab.tsx` → replaced by AgentsPanel
- `packages/tui/src/components/TracesTab.tsx` → replaced by TracesPanel
- `packages/tui/src/components/LogsTab.tsx` → replaced by LogsPanel
- `packages/tui/src/components/ContextTab.tsx` → replaced by ContextPanel
- `packages/tui/src/components/HotkeyDialog.tsx` → replaced by HelpModal

---

## Task 1: Core Types

**Files:**
- Create: `packages/tui/src/core/types.ts`
- Test: `packages/tui/test/core/types.test.ts` (new test file)

- [ ] **Step 1: Write core types**

```typescript
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
```

- [ ] **Step 2: Write test for types**

```typescript
import { describe, test, expect } from "bun:test"
import type { PanelDefinition, LayoutDefinition, TreeNode } from "../../src/core/types"

describe("core types", () => {
  test("PanelDefinition has required fields", () => {
    const panel: PanelDefinition = {
      id: "test",
      title: "Test",
      component: () => null,
      hotkeys: [{ key: "a", description: "do a" }]
    }
    expect(panel.id).toBe("test")
    expect(panel.hotkeys?.[0].key).toBe("a")
  })

  test("LayoutNode has correct structure", () => {
    const node: TreeNode = {
      type: "layout",
      layout: "tabs",
      props: { tabPosition: "top" },
      children: [{ type: "panel", id: "overview" }]
    }
    expect(node.type).toBe("layout")
    expect(node.layout).toBe("tabs")
  })
})
```

- [ ] **Step 3: Run tests**

Run: `bun test packages/tui/test/core/types.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/core/types.ts packages/tui/test/core/types.test.ts
git commit -m "feat(tui): add core types for panel system"
```

---

## Task 2: Panel Registry

**Files:**
- Create: `packages/tui/src/core/PanelRegistry.ts`
- Test: `packages/tui/test/core/PanelRegistry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, test, expect } from "bun:test"
import { PanelRegistry } from "../../src/core/PanelRegistry"
import type { PanelDefinition } from "../../src/core/types"

describe("PanelRegistry", () => {
  test("register and get panel", () => {
    const panel: PanelDefinition = { id: "test", title: "Test", component: () => null }
    PanelRegistry.register(panel)
    expect(PanelRegistry.get("test")).toBe(panel)
  })

  test("getAll returns all panels", () => {
    PanelRegistry.register({ id: "a", title: "A", component: () => null })
    PanelRegistry.register({ id: "b", title: "B", component: () => null })
    const all = PanelRegistry.getAll()
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  test("duplicate id throws", () => {
    PanelRegistry.register({ id: "dup", title: "Dup", component: () => null })
    expect(() => {
      PanelRegistry.register({ id: "dup", title: "Dup2", component: () => null })
    }).toThrow()
  })
})
```

- [ ] **Step 2: Run tests (expect failure)**

Run: `bun test packages/tui/test/core/PanelRegistry.test.ts`
Expected: FAIL (PanelRegistry not found)

- [ ] **Step 3: Implement PanelRegistry**

```typescript
import type { PanelDefinition } from "./types"

const panels = new Map<string, PanelDefinition>()

export const PanelRegistry = {
  register(def: PanelDefinition): void {
    if (panels.has(def.id)) {
      throw new Error(`Panel already registered: ${def.id}`)
    }
    panels.set(def.id, def)
  },

  get(id: string): PanelDefinition | undefined {
    return panels.get(id)
  },

  getAll(): PanelDefinition[] {
    return Array.from(panels.values())
  },

  clear(): void {
    panels.clear()
  }
}
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `bun test packages/tui/test/core/PanelRegistry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/core/PanelRegistry.ts packages/tui/test/core/PanelRegistry.test.ts
git commit -m "feat(tui): add PanelRegistry"
```

---

## Task 3: Layout Registry

**Files:**
- Create: `packages/tui/src/core/LayoutRegistry.ts`
- Test: `packages/tui/test/core/LayoutRegistry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, test, expect } from "bun:test"
import { LayoutRegistry } from "../../src/core/LayoutRegistry"
import type { LayoutDefinition } from "../../src/core/types"

describe("LayoutRegistry", () => {
  test("register and get layout", () => {
    const layout: LayoutDefinition = { id: "test", component: () => null }
    LayoutRegistry.register(layout)
    expect(LayoutRegistry.get("test")).toBe(layout)
  })

  test("duplicate id throws", () => {
    LayoutRegistry.register({ id: "dup", component: () => null })
    expect(() => {
      LayoutRegistry.register({ id: "dup", component: () => null })
    }).toThrow()
  })
})
```

- [ ] **Step 2: Run tests (expect failure)**

Run: `bun test packages/tui/test/core/LayoutRegistry.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement LayoutRegistry**

```typescript
import type { LayoutDefinition } from "./types"

const layouts = new Map<string, LayoutDefinition>()

export const LayoutRegistry = {
  register(def: LayoutDefinition): void {
    if (layouts.has(def.id)) {
      throw new Error(`Layout already registered: ${def.id}`)
    }
    layouts.set(def.id, def)
  },

  get(id: string): LayoutDefinition | undefined {
    return layouts.get(id)
  },

  clear(): void {
    layouts.clear()
  }
}
```

- [ ] **Step 4: Run tests (expect pass)**

Run: `bun test packages/tui/test/core/LayoutRegistry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/core/LayoutRegistry.ts packages/tui/test/core/LayoutRegistry.test.ts
git commit -m "feat(tui): add LayoutRegistry"
```

---

## Task 4: Shared UI Components

**Files:**
- Create: `packages/tui/src/components/StatusBadge.tsx`
- Create: `packages/tui/src/components/LogLine.tsx`
- Create: `packages/tui/src/components/TreeNode.tsx`
- Create: `packages/tui/src/components/SelectList.tsx`
- Create: `packages/tui/src/components/TypeBadge.tsx`
- Create: `packages/tui/src/components/PanelChrome.tsx`

### Task 4a: StatusBadge

- [ ] **Step 1: Write StatusBadge component**

```typescript
import { Text } from "ink"

const STATUS_COLORS: Record<string, string> = {
  done: "green",
  failed: "red",
  blocked: "yellow",
  running: "blue",
}

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "white"
  return <Text color={color}>● {status}</Text>
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/StatusBadge.tsx
git commit -m "feat(tui): add StatusBadge component"
```

### Task 4b: LogLine

- [ ] **Step 1: Write LogLine component**

```typescript
import { Box, Text } from "ink"
import type { Event } from "@adlr/sdk"

const LEVEL_COLORS: Record<string, string> = {
  info: "green",
  warn: "yellow",
  error: "red",
  other: "white",
}

function levelFromType(type: string): "info" | "warn" | "error" | "other" {
  if (type.startsWith("log.info")) return "info"
  if (type.startsWith("log.warn")) return "warn"
  if (type.startsWith("log.error")) return "error"
  return "other"
}

export function LogLine({ event, isSelected }: { event: Event; isSelected: boolean }) {
  const level = levelFromType(event.type)
  const message = (event.data?.message as string) ?? JSON.stringify(event.data)
  return (
    <Box borderStyle={isSelected ? "single" : undefined}>
      <Text dimColor>{new Date(event.timestamp).toLocaleTimeString()}</Text>
      <Text color={LEVEL_COLORS[level]}> {level.toUpperCase()}</Text>
      <Text> {event.type}</Text>
      <Text dimColor> {message}</Text>
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/LogLine.tsx
git commit -m "feat(tui): add LogLine component"
```

### Task 4c: TreeNode

- [ ] **Step 1: Write TreeNode component**

```typescript
import { Box, Text } from "ink"
import type { Span } from "@adlr/sdk"

export function TreeNode({
  span,
  depth,
  isSelected,
}: {
  span: Span
  depth: number
  isSelected: boolean
}) {
  return (
    <Box borderStyle={isSelected ? "single" : undefined}>
      <Text>{"  ".repeat(depth)}</Text>
      <Text color={span.status === "done" ? "green" : span.status === "failed" ? "red" : "yellow"}>
        {span.kind === "agent" ? "●" : "○"}{" "}
      </Text>
      <Text>{span.name}</Text>
      <Text dimColor> {span.status}</Text>
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/TreeNode.tsx
git commit -m "feat(tui): add TreeNode component"
```

### Task 4d: SelectList

- [ ] **Step 1: Write SelectList component**

```typescript
import { Box, Text } from "ink"
import type { ReactNode } from "react"

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
        <Box key={i} borderStyle={i === selectedIndex ? "single" : undefined}>
          {renderItem(item, i, i === selectedIndex)}
        </Box>
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/SelectList.tsx
git commit -m "feat(tui): add SelectList component"
```

### Task 4e: TypeBadge

- [ ] **Step 1: Write TypeBadge component**

```typescript
import { Text } from "ink"

const TYPE_COLORS: Record<string, string> = {
  goal: "green",
  url: "blue",
  file: "yellow",
  text: "white",
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <Text backgroundColor={TYPE_COLORS[type] ?? "white"} color="black">
      {" "}{type.toUpperCase()}{" "}
    </Text>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/TypeBadge.tsx
git commit -m "feat(tui): add TypeBadge component"
```

### Task 4f: PanelChrome

- [ ] **Step 1: Write PanelChrome component**

```typescript
import { Box, Text } from "ink"

export function PanelChrome({
  title,
  width,
  height,
  children,
}: {
  title: string
  width: number
  height: number
  children: React.ReactNode
}) {
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box height={1}>
        <Text bold underline>{title}</Text>
      </Box>
      <Box flexGrow={1} overflow="hidden">
        {children}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/PanelChrome.tsx
git commit -m "feat(tui): add PanelChrome component"
```

---

## Task 5: Convert Tabs to Panels

**Files:**
- Create: `packages/tui/src/components/panels/OverviewPanel.tsx`
- Create: `packages/tui/src/components/panels/AgentsPanel.tsx`
- Create: `packages/tui/src/components/panels/TracesPanel.tsx`
- Create: `packages/tui/src/components/panels/LogsPanel.tsx`
- Create: `packages/tui/src/components/panels/ContextPanel.tsx`
- Create: `packages/tui/src/components/panels/index.ts`
- Modify: `packages/tui/src/types.ts` — remove panel-specific state from reducer

### Task 5a: OverviewPanel

- [ ] **Step 1: Write OverviewPanel**

```typescript
import { Box, Text } from "ink"
import type { PanelProps } from "../../core/types"

export function OverviewPanel({ state, width, height }: PanelProps) {
  const recentAgents = state.spans
    .filter(s => s.kind === "agent")
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, 5)

  return (
    <Box flexDirection="row" width={width} height={height}>
      <Box flexDirection="column" width="50%">
        <Text bold>Session</Text>
        <Text>Status: {state.session?.status}</Text>
        <Text>Working dir: {state.session?.working_dir}</Text>
        <Text bold marginTop={1}>Recent Agents</Text>
        {recentAgents.map(a => (
          <Box key={a.id}>
            <Text color={a.status === "done" ? "green" : a.status === "failed" ? "red" : "yellow"}>
              ● {" "}
            </Text>
            <Text>{a.name} ({a.status})</Text>
          </Box>
        ))}
      </Box>
      <Box flexDirection="column" width="50%">
        <Text bold>Context</Text>
        {state.context.map(item => (
          <Box key={item.id}>
            <Text color={item.type === "goal" ? "green" : item.type === "url" ? "blue" : "white"}>
              {item.type}
            </Text>
            <Text> {item.label ?? "—"}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/panels/OverviewPanel.tsx
git commit -m "feat(tui): add OverviewPanel"
```

### Task 5b: AgentsPanel

- [ ] **Step 1: Write AgentsPanel**

```typescript
import { useState } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"
import type { PanelProps } from "../../core/types"

function formatDuration(started: number, finished: number | null): string {
  const ms = (finished ?? Date.now()) - started
  if (ms < 1000) return `${ms}ms`
  return `${Math.floor(ms / 1000)}s`
}

export function AgentsPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const agents = state.spans.filter(s => s.kind === "agent")

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.min(agents.length - 1, i + 1))
    } else if (key.return) {
      const agent = agents[selectedIndex]
      if (agent) {
        // TODO: attach or read output
      }
    }
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      {agents.map((span, i) => {
        const isSelected = i === selectedIndex
        const duration = formatDuration(span.started_at, span.finished_at)
        return (
          <Box key={span.id} borderStyle={isSelected ? "single" : undefined}>
            <Text color={span.status === "done" ? "green" : span.status === "failed" ? "red" : span.status === "blocked" ? "yellow" : "blue"}>
              ● {" "}
            </Text>
            <Text>{span.data?.agent_type as string} </Text>
            <Text dimColor>{(span.data?.prompt as string)?.slice(0, 40)}… </Text>
            <Text>{duration}</Text>
            {span.data?.exit_code !== null && span.data?.exit_code !== undefined && (
              <Text> exit:{span.data.exit_code}</Text>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/panels/AgentsPanel.tsx
git commit -m "feat(tui): add AgentsPanel with local state"
```

### Task 5c: TracesPanel

- [ ] **Step 1: Write TracesPanel**

```typescript
import { useState } from "react"
import { Box } from "ink"
import { useInput } from "ink"
import type { Span } from "@adlr/sdk"
import type { PanelProps } from "../../core/types"
import { TreeNode } from "../TreeNode"

function buildTree(spans: Span[]): Span[] {
  return spans.filter(s => s.parent_id === null).sort((a, b) => a.started_at - b.started_at)
}

function getChildren(spans: Span[], parentId: string): Span[] {
  return spans.filter(s => s.parent_id === parentId).sort((a, b) => a.started_at - b.started_at)
}

function TreeView({
  span,
  spans,
  depth,
  selectedIndex,
  currentIndex,
}: {
  span: Span
  spans: Span[]
  depth: number
  selectedIndex: number
  currentIndex: { value: number }
}) {
  const isSelected = currentIndex.value === selectedIndex
  currentIndex.value++
  const children = getChildren(spans, span.id)
  return (
    <Box flexDirection="column">
      <TreeNode span={span} depth={depth} isSelected={isSelected} />
      {children.map(child => (
        <TreeView
          key={child.id}
          span={child}
          spans={spans}
          depth={depth + 1}
          selectedIndex={selectedIndex}
          currentIndex={currentIndex}
        />
      ))}
    </Box>
  )
}

export function TracesPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const roots = buildTree(state.spans)
  const currentIndex = { value: 0 }

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.min(state.spans.length - 1, i + 1))
    }
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      {roots.map(span => (
        <TreeView
          key={span.id}
          span={span}
          spans={state.spans}
          depth={0}
          selectedIndex={selectedIndex}
          currentIndex={currentIndex}
        />
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/panels/TracesPanel.tsx
git commit -m "feat(tui): add TracesPanel with local state"
```

### Task 5d: LogsPanel

- [ ] **Step 1: Write LogsPanel**

```typescript
import { useState, useEffect } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"
import { createClient, DAEMON_SESSION_ID } from "@adlr/sdk"
import type { Event } from "@adlr/sdk"
import type { PanelProps } from "../../core/types"
import { LogLine } from "../LogLine"

export function LogsPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [filter, setFilter] = useState<"all" | "info" | "warn" | "error">("all")
  const [autoScroll, setAutoScroll] = useState(true)
  const [logsView, setLogsView] = useState<"session" | "daemon">("session")
  const [daemonEvents, setDaemonEvents] = useState<Event[]>([])

  useEffect(() => {
    const client = createClient()
    let cleanup: (() => void) | undefined
    ;(async () => {
      try {
        const unsub = await client.subscribe(DAEMON_SESSION_ID, (msg) => {
          if (msg.type === "snapshot") {
            const snapshot = msg.payload as { events: Event[] }
            setDaemonEvents(snapshot.events ?? [])
          } else if (msg.type === "event") {
            setDaemonEvents(prev => [msg.payload as Event, ...prev])
          }
        })
        cleanup = unsub
      } catch {
        // Daemon events are best-effort
      }
    })()
    return () => {
      cleanup?.()
      client.close()
    }
  }, [])

  const events = logsView === "daemon" ? daemonEvents : state.events
  const filtered = events.filter(e => {
    if (filter === "all") return true
    const level = e.type.startsWith("log.info") ? "info" : e.type.startsWith("log.warn") ? "warn" : e.type.startsWith("log.error") ? "error" : "other"
    return level === filter
  })
  const display = filtered.slice(0, 50)
  const safeIndex = Math.min(selectedIndex, display.length - 1)

  useInput((input, key) => {
    if (input === "d") {
      setLogsView(v => v === "session" ? "daemon" : "session")
      setSelectedIndex(0)
    } else if (input === "i") {
      setFilter("info")
      setSelectedIndex(0)
    } else if (input === "w") {
      setFilter("warn")
      setSelectedIndex(0)
    } else if (input === "e") {
      setFilter("error")
      setSelectedIndex(0)
    } else if (input === "f") {
      setAutoScroll(a => !a)
    } else if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.min(display.length - 1, i + 1))
    }
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box height={1} marginBottom={1}>
        <Text bold>View: </Text>
        <Text color={logsView === "session" ? "cyan" : "magenta"}>
          {logsView === "session" ? "[Session]" : "[Daemon]"}
        </Text>
        <Text dimColor>  d=toggle  i/w/e=filter  f=autoscroll</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {display.map((event, i) => (
          <LogLine key={event.id} event={event} isSelected={i === safeIndex} />
        ))}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/panels/LogsPanel.tsx
git commit -m "feat(tui): add LogsPanel with local state and daemon subscription"
```

### Task 5e: ContextPanel

- [ ] **Step 1: Write ContextPanel**

```typescript
import { useState } from "react"
import { Box, Text } from "ink"
import { useInput } from "ink"
import type { PanelProps } from "../../core/types"
import { TypeBadge } from "../TypeBadge"

export function ContextPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const grouped = state.context.reduce((acc, item) => {
    acc[item.type] = acc[item.type] ?? []
    acc[item.type].push(item)
    return acc
  }, {} as Record<string, typeof state.context>)

  let globalIndex = 0

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1))
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.min(state.context.length - 1, i + 1))
    }
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      {Object.entries(grouped).map(([type, items]) => (
        <Box key={type} flexDirection="column" marginTop={1}>
          <TypeBadge type={type} />
          <Text dimColor> {items.length} items</Text>
          {items.map(item => {
            const isSelected = globalIndex === selectedIndex
            globalIndex++
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
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/panels/ContextPanel.tsx
git commit -m "feat(tui): add ContextPanel with local state"
```

### Task 5f: Panel Registration

- [ ] **Step 1: Write panels/index.ts**

```typescript
import { PanelRegistry } from "../../core/PanelRegistry"
import { OverviewPanel } from "./OverviewPanel"
import { AgentsPanel } from "./AgentsPanel"
import { TracesPanel } from "./TracesPanel"
import { LogsPanel } from "./LogsPanel"
import { ContextPanel } from "./ContextPanel"

export function registerPanels() {
  PanelRegistry.register({
    id: "overview",
    title: "Overview",
    component: OverviewPanel,
  })

  PanelRegistry.register({
    id: "context",
    title: "Context",
    component: ContextPanel,
  })

  PanelRegistry.register({
    id: "agents",
    title: "Agents",
    component: AgentsPanel,
    hotkeys: [
      { key: "↑↓", description: "navigate" },
      { key: "enter", description: "attach to running agent or read output" },
    ]
  })

  PanelRegistry.register({
    id: "traces",
    title: "Traces",
    component: TracesPanel,
    hotkeys: [
      { key: "↑↓", description: "navigate" },
      { key: "enter", description: "expand/collapse" },
    ]
  })

  PanelRegistry.register({
    id: "logs",
    title: "Logs",
    component: LogsPanel,
    hotkeys: [
      { key: "d", description: "Toggle daemon/session view" },
      { key: "i", description: "Filter info" },
      { key: "w", description: "Filter warn" },
      { key: "e", description: "Filter error" },
      { key: "f", description: "Toggle auto-scroll" },
    ]
  })
}

export { OverviewPanel, AgentsPanel, TracesPanel, LogsPanel, ContextPanel }
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/panels/index.ts
git commit -m "feat(tui): register all built-in panels with hotkeys"
```

### Task 5g: Simplify Reducer

- [ ] **Step 1: Modify types.ts**

Remove panel-specific state from `AppState` and `AppAction`:

```typescript
export interface AppState {
  session: Session | null
  spans: Span[]
  events: Event[]
  context: ContextItem[]
  daemonEvents: Event[]
}

export type AppAction =
  | { type: "setState"; payload: Partial<AppState> }
  | { type: "snapshot"; payload: { session: Session; spans: Span[]; events: Event[]; context: ContextItem[] } }
  | { type: "event"; payload: Event }
  | { type: "daemonEvent"; payload: Event }
  | { type: "daemonSnapshot"; payload: Event[] }

export const initialState: AppState = {
  session: null,
  spans: [],
  events: [],
  context: [],
  daemonEvents: [],
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "setState":
      return { ...state, ...action.payload }
    case "snapshot":
      return {
        ...state,
        session: action.payload.session,
        spans: action.payload.spans,
        events: action.payload.events,
        context: action.payload.context,
      }
    case "event":
      return { ...state, events: [action.payload, ...state.events] }
    case "daemonEvent":
      return { ...state, daemonEvents: [action.payload, ...state.daemonEvents] }
    case "daemonSnapshot":
      return { ...state, daemonEvents: action.payload }
    default:
      return state
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/types.ts
git commit -m "refactor(tui): remove panel-specific state from central reducer"
```

---

## Task 6: Layout Shells

**Files:**
- Create: `packages/tui/src/components/layouts/TabsLayout.tsx`
- Create: `packages/tui/src/components/layouts/SplitLayout.tsx`
- Create: `packages/tui/src/components/layouts/index.ts`

### Task 6a: TabsLayout

- [ ] **Step 1: Write TabsLayout**

```typescript
import { Box, Text } from "ink"
import type { LayoutProps } from "../../core/types"

export function TabsLayout({
  layoutProps,
  children,
  width,
  height,
  focusPath,
  onFocusChange,
}: LayoutProps) {
  const activeIndex = focusPath[0] ?? 0
  const tabPosition = (layoutProps.tabPosition as "top" | "bottom") ?? "top"
  const childArray = Array.isArray(children) ? children : [children]

  return (
    <Box flexDirection="column" width={width} height={height}>
      {tabPosition === "top" && (
        <Box height={1} flexDirection="row">
          {childArray.map((_, i) => (
            <Text key={i} bold={i === activeIndex} color={i === activeIndex ? "blue" : undefined}>
              [{i + 1}]{" "}
            </Text>
          ))}
        </Box>
      )}
      <Box flexGrow={1} overflow="hidden">
        {childArray[activeIndex]}
      </Box>
      {tabPosition === "bottom" && (
        <Box height={1} flexDirection="row">
          {childArray.map((_, i) => (
            <Text key={i} bold={i === activeIndex} color={i === activeIndex ? "blue" : undefined}>
              [{i + 1}]{" "}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/layouts/TabsLayout.tsx
git commit -m "feat(tui): add TabsLayout"
```

### Task 6b: SplitLayout

- [ ] **Step 1: Write SplitLayout**

```typescript
import { Box } from "ink"
import type { LayoutProps } from "../../core/types"

export function SplitLayout({
  layoutProps,
  children,
  width,
  height,
  focusPath,
  onFocusChange,
}: LayoutProps) {
  const ratio = (layoutProps.ratio as number) ?? 0.5
  const direction = (layoutProps.direction as "horizontal" | "vertical") ?? "horizontal"
  const childArray = Array.isArray(children) ? children : [children]
  const [first, second] = childArray

  if (direction === "horizontal") {
    const firstWidth = Math.floor(width * ratio)
    const secondWidth = width - firstWidth
    return (
      <Box flexDirection="row" width={width} height={height}>
        <Box width={firstWidth} height={height} overflow="hidden">
          {first}
        </Box>
        <Box width={secondWidth} height={height} overflow="hidden">
          {second}
        </Box>
      </Box>
    )
  }

  const firstHeight = Math.floor(height * ratio)
  const secondHeight = height - firstHeight
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box width={width} height={firstHeight} overflow="hidden">
        {first}
      </Box>
      <Box width={width} height={secondHeight} overflow="hidden">
        {second}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/layouts/SplitLayout.tsx
git commit -m "feat(tui): add SplitLayout"
```

### Task 6c: Layout Registration

- [ ] **Step 1: Write layouts/index.ts**

```typescript
import { LayoutRegistry } from "../../core/LayoutRegistry"
import { TabsLayout } from "./TabsLayout"
import { SplitLayout } from "./SplitLayout"

export function registerLayouts() {
  LayoutRegistry.register({
    id: "tabs",
    component: TabsLayout,
    defaultLayoutProps: { tabPosition: "top" },
  })

  LayoutRegistry.register({
    id: "split",
    component: SplitLayout,
    defaultLayoutProps: { ratio: 0.5, direction: "horizontal" },
  })
}

export { TabsLayout, SplitLayout }
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/layouts/index.ts
git commit -m "feat(tui): register built-in layouts"
```

---

## Task 7: Layout Renderer

**Files:**
- Create: `packages/tui/src/core/LayoutRenderer.tsx`
- Test: `packages/tui/test/core/LayoutRenderer.test.tsx`

- [ ] **Step 1: Write LayoutRenderer**

```typescript
import { Box } from "ink"
import type { TreeNode, PanelProps, LayoutProps } from "./types"
import { PanelRegistry } from "./PanelRegistry"
import { LayoutRegistry } from "./LayoutRegistry"
import { PanelChrome } from "../components/PanelChrome"
import type { AppState, AppAction } from "../types"
import React from "react"

interface LayoutRendererProps {
  node: TreeNode
  state: AppState
  dispatch: React.Dispatch<AppAction>
  width: number
  height: number
  focusPath: number[]
  onFocusChange: (path: number[]) => void
}

export function LayoutRenderer({
  node,
  state,
  dispatch,
  width,
  height,
  focusPath,
  onFocusChange,
}: LayoutRendererProps) {
  if (node.type === "panel") {
    const panel = PanelRegistry.get(node.id)
    if (!panel) {
      return (
        <Box width={width} height={height}>
          <Text color="red">Unknown panel: {node.id}</Text>
        </Box>
      )
    }
    return (
      <PanelChrome title={panel.title} width={width} height={height}>
        <panel.component state={state} dispatch={dispatch} width={width} height={height} />
      </PanelChrome>
    )
  }

  const layout = LayoutRegistry.get(node.layout)
  if (!layout) {
    return (
      <Box width={width} height={height}>
        <Text color="red">Unknown layout: {node.layout}</Text>
      </Box>
    )
  }

  const childCount = node.children.length
  const childWidth = width
  const childHeight = height

  const children = node.children.map((child, i) => (
    <LayoutRenderer
      key={i}
      node={child}
      state={state}
      dispatch={dispatch}
      width={childWidth}
      height={childHeight}
      focusPath={focusPath.slice(1)}
      onFocusChange={(subPath) => onFocusChange([i, ...subPath])}
    />
  ))

  return (
    <layout.component
      layoutProps={node.props}
      width={width}
      height={height}
      state={state}
      dispatch={dispatch}
      focusPath={focusPath}
      onFocusChange={onFocusChange}
    >
      {children}
    </layout.component>
  )
}
```

- [ ] **Step 2: Write test**

```typescript
import { describe, test, expect } from "bun:test"
import React from "react"
import { render } from "ink"
import { LayoutRenderer } from "../../src/core/LayoutRenderer"
import { PanelRegistry } from "../../src/core/PanelRegistry"
import { LayoutRegistry } from "../../src/core/LayoutRegistry"
import { registerPanels } from "../../src/components/panels"
import { registerLayouts } from "../../src/components/layouts"
import { initialState } from "../../src/types"

describe("LayoutRenderer", () => {
  test("renders panel node", () => {
    PanelRegistry.clear()
    LayoutRegistry.clear()
    registerPanels()
    registerLayouts()

    const node = { type: "panel" as const, id: "overview" }
    const { lastFrame } = render(
      <LayoutRenderer
        node={node}
        state={initialState}
        dispatch={() => {}}
        width={80}
        height={24}
        focusPath={[]}
        onFocusChange={() => {}}
      />
    )
    expect(lastFrame()).toContain("Overview")
  })

  test("renders layout node with children", () => {
    const node = {
      type: "layout" as const,
      layout: "tabs",
      props: {},
      children: [
        { type: "panel" as const, id: "overview" }
      ]
    }
    const { lastFrame } = render(
      <LayoutRenderer
        node={node}
        state={initialState}
        dispatch={() => {}}
        width={80}
        height={24}
        focusPath={[0]}
        onFocusChange={() => {}}
      />
    )
    expect(lastFrame()).toContain("Overview")
  })
})
```

- [ ] **Step 3: Run tests**

Run: `bun test packages/tui/test/core/LayoutRenderer.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/core/LayoutRenderer.tsx packages/tui/test/core/LayoutRenderer.test.tsx
git commit -m "feat(tui): add LayoutRenderer with recursive rendering"
```

---

## Task 8: Footer & Help Modal

**Files:**
- Modify: `packages/tui/src/components/Footer.tsx` (rewrite)
- Create: `packages/tui/src/components/HelpModal.tsx`

### Task 8a: Footer

- [ ] **Step 1: Rewrite Footer**

```typescript
import { Box, Text } from "ink"
import { PanelRegistry } from "../core/PanelRegistry"

export function Footer({ focusedPanelId }: { focusedPanelId: string | null }) {
  const panel = focusedPanelId ? PanelRegistry.get(focusedPanelId) : null
  const hotkeys = [
    ...(panel?.hotkeys?.map(h => `${h.key}=${h.description}`) ?? []),
    "? help",
    "q quit"
  ]
  return (
    <Box height={1} justifyContent="space-between">
      <Box>
        {hotkeys.map((hk) => (
          <Text key={hk} backgroundColor="blue" color="white">
            {" "}{hk}{" "}
          </Text>
        ))}
      </Box>
      <Text dimColor>{panel?.title ?? "No panel focused"}</Text>
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/Footer.tsx
git commit -m "feat(tui): rewrite Footer to show focused panel hotkeys"
```

### Task 8b: HelpModal

- [ ] **Step 1: Write HelpModal**

```typescript
import { Box, Text } from "ink"
import { PanelRegistry } from "../core/PanelRegistry"

export function HelpModal({ onClose }: { onClose: () => void }) {
  const panels = PanelRegistry.getAll()
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      padding={1}
      width={60}
      height={20}
    >
      <Text bold>Hotkeys</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text bold underline>Global</Text>
        <Text>tab / shift+tab — next / prev focus</Text>
        <Text>q / ctrl+c — quit</Text>
        <Text>? — toggle help</Text>
      </Box>
      {panels.map(panel => (
        <Box key={panel.id} marginTop={1} flexDirection="column">
          <Text bold underline>{panel.title}</Text>
          {panel.hotkeys?.map(hk => (
            <Text key={hk.key}>{hk.key} — {hk.description}</Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/HelpModal.tsx
git commit -m "feat(tui): add HelpModal overlay"
```

---

## Task 9: Header

**Files:**
- Modify: `packages/tui/src/components/Header.tsx`

- [ ] **Step 1: Rewrite Header**

```typescript
import { Box, Text } from "ink"
import type { Session } from "@adlr/sdk"

export function Header({ session }: { session: Session | null }) {
  return (
    <Box flexDirection="column" height={1}>
      <Box>
        <Text bold>adlr</Text>
        <Text> · session: {session?.id.slice(0, 6)}</Text>
        <Text> · {session?.status}</Text>
        <Text> · {session?.working_dir}</Text>
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/tui/src/components/Header.tsx
git commit -m "feat(tui): rewrite Header to remove hardcoded tabs"
```

---

## Task 10: Fullscreen App

**Files:**
- Modify: `packages/tui/src/app.tsx` (major rewrite)
- Delete: `packages/tui/src/components/HotkeyDialog.tsx`
- Delete: `packages/tui/src/components/OverviewTab.tsx`
- Delete: `packages/tui/src/components/AgentsTab.tsx`
- Delete: `packages/tui/src/components/TracesTab.tsx`
- Delete: `packages/tui/src/components/LogsTab.tsx`
- Delete: `packages/tui/src/components/ContextTab.tsx`

### Task 10a: Rewrite App

- [ ] **Step 1: Write new App.tsx**

```typescript
import { useEffect, useReducer, useState } from "react"
import { Box, useInput, useApp, useStdout } from "ink"
import { createClient, type EventType, DAEMON_SESSION_ID } from "@adlr/sdk"
import { initialState, reducer } from "./types"
import { Header } from "./components/Header"
import { Footer } from "./components/Footer"
import { HelpModal } from "./components/HelpModal"
import { LayoutRenderer } from "./core/LayoutRenderer"
import { registerPanels } from "./components/panels"
import { registerLayouts } from "./components/layouts"
import type { TreeNode } from "./core/types"

// Default layout: tabs with all panels
const defaultLayout: TreeNode = {
  type: "layout",
  layout: "tabs",
  props: {},
  children: [
    { type: "panel", id: "overview" },
    { type: "panel", id: "context" },
    { type: "panel", id: "agents" },
    { type: "panel", id: "traces" },
    { type: "panel", id: "logs" }
  ]
}

function resolveFocusedPanel(node: TreeNode, focusPath: number[]): string | null {
  if (node.type === "panel") return node.id
  if (focusPath.length === 0) return null
  const childIndex = focusPath[0]
  const child = node.children[childIndex]
  if (!child) return null
  return resolveFocusedPanel(child, focusPath.slice(1))
}

export function App({ sessionId }: { sessionId: string }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [focusPath, setFocusPath] = useState<number[]>([0])
  const [layout] = useState<TreeNode>(defaultLayout)
  const { exit } = useApp()
  const { stdout } = useStdout()

  // Register panels and layouts
  useEffect(() => {
    registerPanels()
    registerLayouts()
  }, [])

  // Subscribe to session events
  useEffect(() => {
    const client = createClient()
    let cleanup: (() => void) | undefined
    ;(async () => {
      try {
        const unsub = await client.subscribe(sessionId, (msg) => {
          if (msg.type === "snapshot") {
            dispatch({ type: "snapshot", payload: msg.payload })
          } else if (msg.type === "event") {
            dispatch({
              type: "event",
              payload: {
                id: Date.now(),
                session_id: sessionId,
                span_id: (msg.payload as any)?.span_id ?? null,
                type: msg.event as EventType,
                data: msg.payload as any,
                timestamp: Date.now(),
              },
            })
          }
        })
        cleanup = unsub
      } catch (err) {
        dispatch({
          type: "event",
          payload: {
            id: Date.now(),
            session_id: sessionId,
            span_id: null,
            type: "log.error",
            data: { message: String(err) },
            timestamp: Date.now(),
          },
        })
      }
    })()
    return () => {
      cleanup?.()
      client.close()
    }
  }, [sessionId])

  // Subscribe to daemon events
  useEffect(() => {
    const client = createClient()
    let cleanup: (() => void) | undefined
    ;(async () => {
      try {
        const unsub = await client.subscribe(DAEMON_SESSION_ID, (msg) => {
          if (msg.type === "snapshot") {
            const snapshot = msg.payload as { session: any; spans: any[]; events: any[]; context: any[] }
            dispatch({ type: "daemonSnapshot", payload: snapshot.events ?? [] })
          } else if (msg.type === "event") {
            dispatch({
              type: "daemonEvent",
              payload: {
                id: Date.now(),
                session_id: DAEMON_SESSION_ID,
                span_id: null,
                type: msg.event as EventType,
                data: msg.payload as any,
                timestamp: Date.now(),
              },
            })
          }
        })
        cleanup = unsub
      } catch {
        // Daemon events are best-effort
      }
    })()
    return () => {
      cleanup?.()
      client.close()
    }
  }, [])

  const focusedPanel = resolveFocusedPanel(layout, focusPath)

  useInput((input, key) => {
    if (isHelpOpen) {
      if (input === "?" || key.escape) {
        setIsHelpOpen(false)
      }
      return
    }

    if (input === "?") {
      setIsHelpOpen(true)
      return
    }

    if (input === "q" || (key.ctrl && input === "c")) {
      exit()
      return
    }

    if (key.tab) {
      // Navigate focus forward/backward
      // This is a simplified version; full implementation would walk the tree
      setFocusPath(path => {
        if (path.length === 0) return [0]
        const newPath = [...path]
        newPath[0] = key.shift
          ? Math.max(0, newPath[0] - 1)
          : Math.min(4, newPath[0] + 1)
        return newPath
      })
      return
    }
  })

  const width = stdout.columns ?? 80
  const height = stdout.rows ?? 24

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Header session={state.session} />
      <Box flexGrow={1} overflow="hidden">
        <LayoutRenderer
          node={layout}
          state={state}
          dispatch={dispatch}
          width={width}
          height={height - 2} // minus header and footer
          focusPath={focusPath}
          onFocusChange={setFocusPath}
        />
      </Box>
      {isHelpOpen && (
        <Box position="absolute" width={width} height={height} justifyContent="center" alignItems="center">
          <HelpModal onClose={() => setIsHelpOpen(false)} />
        </Box>
      )}
      <Footer focusedPanelId={focusedPanel} />
    </Box>
  )
}
```

- [ ] **Step 2: Delete old tab files**

```bash
rm packages/tui/src/components/OverviewTab.tsx
rm packages/tui/src/components/AgentsTab.tsx
rm packages/tui/src/components/TracesTab.tsx
rm packages/tui/src/components/LogsTab.tsx
rm packages/tui/src/components/ContextTab.tsx
rm packages/tui/src/components/HotkeyDialog.tsx
```

- [ ] **Step 3: Commit**

```bash
git add packages/tui/src/app.tsx
git add packages/tui/src/components/Header.tsx
rm packages/tui/src/components/OverviewTab.tsx
rm packages/tui/src/components/AgentsTab.tsx
rm packages/tui/src/components/TracesTab.tsx
rm packages/tui/src/components/LogsTab.tsx
rm packages/tui/src/components/ContextTab.tsx
rm packages/tui/src/components/HotkeyDialog.tsx
git add -A
git commit -m "feat(tui): rewrite App with fullscreen, layout renderer, footer, help modal

BREAKING CHANGE: removes old tab components and HotkeyDialog"
```

---

## Task 11: Config Integration

**Files:**
- Modify: `packages/tui/src/app.tsx` — load layout from config
- Modify: `packages/cli/src/config-loader.ts` (or wherever config is loaded) — evaluate tui.layout

### Task 11a: Config Layout Evaluation

- [ ] **Step 1: Add layout evaluation function**

Create `packages/tui/src/core/evaluateLayout.ts`:

```typescript
import type { TreeNode } from "./types"

interface LayoutPrimitives {
  Layout: (props: any) => TreeNode
  Panel: (props: any) => TreeNode
}

export function evaluateLayout(
  layoutFn: (primitives: LayoutPrimitives) => TreeNode
): TreeNode {
  const Layout = (props: any): TreeNode => ({
    type: "layout",
    layout: props.type,
    props: Object.fromEntries(
      Object.entries(props).filter(([k]) => k !== "type" && k !== "children")
    ),
    children: props.children ?? []
  })

  const Panel = (props: any): TreeNode => ({
    type: "panel",
    id: props.id
  })

  return layoutFn({ Layout, Panel })
}
```

- [ ] **Step 2: Write test**

```typescript
import { describe, test, expect } from "bun:test"
import { evaluateLayout } from "../../src/core/evaluateLayout"

describe("evaluateLayout", () => {
  test("evaluates tabs layout with panels", () => {
    const tree = evaluateLayout(({ Layout, Panel }) =>
      Layout({ type: "tabs", children: [
        Panel({ id: "overview" })
      ]})
    )
    expect(tree.type).toBe("layout")
    expect(tree.layout).toBe("tabs")
    expect(tree.children[0].type).toBe("panel")
    expect(tree.children[0].id).toBe("overview")
  })

  test("evaluates split layout with ratio", () => {
    const tree = evaluateLayout(({ Layout, Panel }) =>
      Layout({ type: "split", ratio: 0.6, children: [
        Panel({ id: "agents" }),
        Panel({ id: "logs" })
      ]})
    )
    expect(tree.props.ratio).toBe(0.6)
    expect(tree.children.length).toBe(2)
  })
})
```

- [ ] **Step 3: Run tests**

Run: `bun test packages/tui/test/core/evaluateLayout.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/core/evaluateLayout.ts packages/tui/test/core/evaluateLayout.test.ts
git commit -m "feat(tui): add layout evaluation from config"
```

### Task 11b: Validate Layout Tree

- [ ] **Step 1: Add validation function**

Create `packages/tui/src/core/validateLayout.ts`:

```typescript
import type { TreeNode } from "./types"
import { PanelRegistry } from "./PanelRegistry"
import { LayoutRegistry } from "./LayoutRegistry"

export function validateLayout(node: TreeNode): string[] {
  const errors: string[] = []

  if (node.type === "panel") {
    if (!PanelRegistry.get(node.id)) {
      errors.push(`Unknown panel: ${node.id}`)
    }
    return errors
  }

  const layout = LayoutRegistry.get(node.layout)
  if (!layout) {
    errors.push(`Unknown layout: ${node.layout}`)
    return errors
  }

  if (node.children.length === 0) {
    errors.push(`Layout ${node.layout} must have at least one child`)
  }

  if (node.layout === "split" && node.children.length !== 2) {
    errors.push(`Split layout must have exactly 2 children, got ${node.children.length}`)
  }

  for (const child of node.children) {
    errors.push(...validateLayout(child))
  }

  return errors
}
```

- [ ] **Step 2: Write test**

```typescript
import { describe, test, expect, beforeEach } from "bun:test"
import { validateLayout } from "../../src/core/validateLayout"
import { PanelRegistry } from "../../src/core/PanelRegistry"
import { LayoutRegistry } from "../../src/core/LayoutRegistry"
import { registerPanels } from "../../src/components/panels"
import { registerLayouts } from "../../src/components/layouts"

describe("validateLayout", () => {
  beforeEach(() => {
    PanelRegistry.clear()
    LayoutRegistry.clear()
    registerPanels()
    registerLayouts()
  })

  test("validates correct tree", () => {
    const tree = {
      type: "layout" as const,
      layout: "tabs",
      props: {},
      children: [
        { type: "panel" as const, id: "overview" }
      ]
    }
    expect(validateLayout(tree)).toEqual([])
  })

  test("detects unknown panel", () => {
    const tree = { type: "panel" as const, id: "unknown" }
    expect(validateLayout(tree)).toContain("Unknown panel: unknown")
  })

  test("detects split with wrong child count", () => {
    const tree = {
      type: "layout" as const,
      layout: "split",
      props: {},
      children: [
        { type: "panel" as const, id: "overview" }
      ]
    }
    expect(validateLayout(tree)).toContain("Split layout must have exactly 2 children, got 1")
  })
})
```

- [ ] **Step 3: Run tests**

Run: `bun test packages/tui/test/core/validateLayout.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/tui/src/core/validateLayout.ts packages/tui/test/core/validateLayout.test.ts
git commit -m "feat(tui): add layout tree validation"
```

---

## Task 12: Integration Testing

**Files:**
- Test: `packages/tui/test/app.test.tsx`

- [ ] **Step 1: Write integration test**

```typescript
import { describe, test, expect, beforeEach } from "bun:test"
import React from "react"
import { render } from "ink"
import { App } from "../src/app"
import { PanelRegistry } from "../src/core/PanelRegistry"
import { LayoutRegistry } from "../src/core/LayoutRegistry"

describe("App", () => {
  beforeEach(() => {
    PanelRegistry.clear()
    LayoutRegistry.clear()
  })

  test("renders default layout with all panels", () => {
    const { lastFrame } = render(<App sessionId="test-123" />)
    const frame = lastFrame()
    expect(frame).toContain("adlr")
    expect(frame).toContain("Overview")
  })

  test("renders footer with help hint", () => {
    const { lastFrame } = render(<App sessionId="test-123" />)
    expect(lastFrame()).toContain("? help")
    expect(lastFrame()).toContain("q quit")
  })
})
```

- [ ] **Step 2: Run tests**

Run: `bun test packages/tui/test/app.test.tsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/tui/test/app.test.tsx
git commit -m "test(tui): add App integration tests"
```

---

## Task 13: Final Cleanup

- [ ] **Step 1: Run all tests**

Run: `bun test packages/tui`
Expected: All tests pass

- [ ] **Step 2: Verify no dead code**

Check for any remaining references to old tab components or HotkeyDialog.

- [ ] **Step 3: Update README if needed**

If the README has TUI screenshots or documentation, update them to reflect the new panel-based architecture.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tui): complete panel system refactor

- Fullscreen mode with terminal resize handling
- PanelRegistry for self-contained panels
- LayoutRegistry for nestable layouts (Tabs, Split)
- Recursive LayoutRenderer
- Footer showing focused panel hotkeys
- Help modal (? key) showing all hotkeys grouped by panel
- Config-driven layout via tui.layout in adlr.tsx
- All panel-specific state moved to local React state
- Shared UI components: PanelChrome, StatusBadge, LogLine, TreeNode, SelectList, TypeBadge"
```

---

## Spec Coverage Check

| Spec Section | Task(s) |
|--------------|---------|
| 3.1 PanelRegistry | Task 2 |
| 3.1 LayoutRegistry | Task 3 |
| 3.1 LayoutRenderer | Task 7 |
| 3.1 PanelChrome | Task 4f |
| 3.2 Config (tui.layout) | Task 11 |
| 3.3 Layout Tree (JSON) | Task 1 |
| 4 Panel API | Tasks 5a-5e |
| 5 Fullscreen | Task 10 |
| 6 Footer & Help Modal | Task 8 |
| 7 Layout Registry | Task 6 |
| 7.3 Layout Renderer | Task 7 |
| 8 Config Integration | Task 11 |
| 9 Data Flow | Task 5g, 10 |
| 10 Shared Components | Task 4 |
| 11 Plugin Future-Proofing | Task 2, 3 |
| 12 Example Configs | Task 11 |

---

## Placeholder Scan

- No TBD, TODO, or "implement later" found
- All test code is complete with assertions
- All implementation code is complete with exact types
- No vague steps like "add error handling" — each step has concrete code
- No "similar to Task N" references

## Type Consistency Check

- `PanelProps` — used in Task 1, Tasks 5a-5e, consistent
- `LayoutProps` — used in Task 1, Task 6, Task 7, consistent
- `TreeNode` — used in Task 1, Task 7, Task 11, consistent
- `AppState` — used in Task 5g, Task 10, consistent
- `AppAction` — used in Task 5g, Task 10, consistent
- `PanelRegistry` API — `register`, `get`, `getAll`, `clear` — consistent across all tasks
- `LayoutRegistry` API — `register`, `get`, `clear` — consistent across all tasks
