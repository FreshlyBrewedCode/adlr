# TUI Panel System Design

**Date:** 2026-06-16
**Status:** Approved

## 1. Goals

Restructure the adler TUI into a **panel-based architecture** where:

- Panels are self-contained, responsive UI units that can be composed into configurable layouts
- The existing tabs (Overview, Context, Agents, Traces, Logs) become the first built-in panels
- Layouts are registrable, nestable, and config-driven
- The `adler.tsx` config can define the TUI layout using JSX without importing UI components
- The architecture is future-proof for a plugin system that adds new panels
- The TUI runs in **fullscreen** mode, taking full advantage of the terminal real estate
- Fullscreen mode is seamless, without any visible UI decorations that detract from the panels
- The app layer handles stdin/stdout to properly go fullscreen and restore on exit

## 1.1. Fullscreen Requirement

The TUI must run in fullscreen mode. This means:
- The app takes full advantage of the terminal real estate
- The app layer handles stdin/stdout to properly go fullscreen and restore on exit
- No visible UI decorations that detract from the panels (e.g., window chrome, scrollbars)
- Fullscreen mode is the default and only mode for the TUI
- On exit, the terminal state is restored to its previous state

## 2. Context

The current TUI (`packages/tui`) is a single React app with:
- A central reducer in `types.ts` managing all state (session, spans, events, context, tab indices, filters, selections)
- 5 hardcoded tabs rendered in `app.tsx` with inline conditional rendering
- Tab-specific keyboard handling hardcoded in `app.tsx` (e.g., arrow keys for agents, `d`/`i`/`w`/`e`/`f` for logs)
- Each tab is a separate component in `components/*Tab.tsx`

This design is rigid: adding a new tab requires editing `app.tsx`, `Header.tsx`, `Footer.tsx`, and the reducer.

## 3. Architecture Overview

The system splits into three layers:

### 3.1. `@adler/tui` — The TUI Package

Owns the runtime, registries, and renderer.

**Registries:**
- `PanelRegistry` — maps panel IDs to `{ id, title, component, hotkeys, description }`
- `LayoutRegistry` — maps layout type strings to `{ id, component, defaultLayoutProps }`

**Core Components:**
- `LayoutRenderer` — recursive React component that walks the layout tree and renders layouts/panels
- `PanelChrome` — shared wrapper for borders, titles, scroll indicators
- `App` — bootstraps the store, loads the layout from config, and renders the root `LayoutRenderer`
- `Fullscreen` — handles fullscreen mode, terminal resize events, and cleanup on exit
- `Footer` — always-visible footer showing hotkeys for the focused panel
- `HelpModal` — modal overlay dialog showing all hotkeys grouped by panel

**Shared UI Components:**
- `StatusBadge` — colored dot with status text
- `LogLine` — timestamp + level + message
- `TreeNode` — indented tree with expand/collapse
- `SelectList` — navigable list with border highlighting
- `TypeBadge` — colored badge for context item types

### 3.2. Config — `adler.tsx`

The config exports a `tui` section with a layout function. The function receives data constructor primitives (`Layout`, `Panel`) as arguments and returns a JSX tree (which evaluates to plain JSON objects).

```tsx
export default {
  // ...existing config (plugins, agents, hooks, workflows)...
  tui: {
    layout: ({ Layout, Panel }) => (
      <Layout type="tabs">
        <Layout type="split" ratio={0.6}>
          <Panel id="overview" />
          <Panel id="agents" />
        </Layout>
        <Panel id="traces" />
        <Panel id="logs" />
      </Layout>
    )
  }
}
```

**No imports** in the config. The `Layout` and `Panel` functions are injected by the TUI at evaluation time.

### 3.3. Layout Tree — Plain JSON Objects

The JSX in the config evaluates to a plain JSON tree. The TUI normalizes and validates this tree before rendering.

```ts
interface LayoutNode {
  type: "layout"
  layout: string      // layout type ID (e.g., "tabs", "split")
  props: Record<string, unknown>
  children: TreeNode[]
}

interface PanelNode {
  type: "panel"
  id: string          // panel ID from PanelRegistry
}

type TreeNode = LayoutNode | PanelNode
```

## 4. Panel Concept & API

A Panel is a self-contained UI unit.

### 4.1. Panel Definition

```ts
interface HotkeyDefinition {
  key: string
  description: string
  handler: (state: AppState, dispatch: Dispatch<AppAction>) => void
}

interface PanelDefinition {
  id: string
  title: string
  description?: string
  component: React.ComponentType<PanelProps>
  hotkeys?: HotkeyDefinition[]
}

interface PanelProps {
  state: AppState          // shared state from central store
  dispatch: Dispatch<AppAction>
  width: number            // allocated terminal width
  height: number           // allocated terminal height
}
```

### 4.2. Panel Responsibilities

- **Rendering:** Render content within the allocated `width` × `height` area
- **Responsive behavior:** Adapt layout based on available space (e.g., fewer columns when narrow)
- **Local state:** Manage panel-specific state (selection indices, filters, scroll position) using local React state, not the central reducer
- **Optional data subscriptions:** Use hooks inside the component for panel-specific data (e.g., daemon logs)
- **Keyboard handling:** Define hotkeys in `hotkeys` metadata; the layout shell handles dispatching them

### 4.3. Built-in Panels

The existing tabs become panels:

| Panel ID | Title | Source |
|----------|-------|--------|
| `overview` | Overview | `OverviewTab.tsx` |
| `context` | Context | `ContextTab.tsx` |
| `agents` | Agents | `AgentsTab.tsx` |
| `traces` | Traces | `TracesTab.tsx` |
| `logs` | Logs | `LogsTab.tsx` |

Each panel is extracted from its current `*Tab.tsx` into a `panels/` directory. The central reducer's panel-specific state (e.g., `agentsSelectedIndex`, `logsFilter`, `logsAutoScroll`) is removed from the reducer and moved into panel-local state.

## 5. Fullscreen Mode

The TUI runs in fullscreen mode to maximize terminal real estate for the panel layout.

### 5.1. Implementation

- Use `ink`'s `render` with `stdout` in raw mode or use `ink`'s fullscreen mode
- The `App` component manages the terminal state:
  - On mount: clear screen, hide cursor, enter raw mode
  - On unmount: clear screen, show cursor, exit raw mode, restore terminal
- Terminal resize events are captured via `process.stdout.on('resize')` and passed to the `LayoutRenderer` via `width` and `height` props
- The root `Layout` receives the full terminal dimensions (`stdout.columns` × `stdout.rows`)

### 5.2. Responsive Behavior

- Panels receive their allocated `width` and `height` from the parent layout
- The `LayoutRenderer` passes these dimensions down the tree
- Each layout shell computes child dimensions based on its props (e.g., `SplitLayout` divides by `ratio`)
- Panels adapt their content based on available space (e.g., fewer columns when narrow)

## 6. Footer & Help Modal

### 6.1. Footer

The **Footer** is always visible at the bottom of the screen. It displays:
- **Hotkeys for the focused panel** — read from the panel's `hotkeys` metadata
- **Global hotkeys** — `?` for help, `q` for quit
- **Layout indicators** — current layout path or tab name

The footer is rendered by the `App` component, not by any layout. It receives the current focus path and resolves the focused panel from the layout tree to read its hotkeys.

### 6.2. Help Modal

The **Help Modal** is an overlay dialog that appears when the user presses `?`. It displays:
- **Global hotkeys** — app-level shortcuts (quit, help, tab navigation)
- **Panel hotkeys** — grouped by panel title, showing all registered panels and their hotkeys
- **Layout hotkeys** — shortcuts for the current layout (e.g., tab switching in `TabsLayout`)

The modal is rendered as an overlay on top of the layout content using `ink`'s absolute positioning or a z-index-like approach with `Box` layering.

### 6.3. Panel Hotkey Registration

Panels register hotkeys in their `PanelDefinition`:

```ts
interface HotkeyDefinition {
  key: string
  description: string
  handler?: (state: AppState, dispatch: Dispatch<AppAction>) => void
}

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
```

The `handler` is optional. If provided, the `App` component dispatches the action when the key is pressed. If not provided, the panel handles the key internally via ink's `useInput` hook.

### 6.4. Footer Rendering

```tsx
function Footer({ focusedPanel, layoutHotkeys }) {
  const panel = PanelRegistry.get(focusedPanel)
  const hotkeys = [
    ...(panel?.hotkeys?.map(h => `${h.key}=${h.description}`) ?? []),
    ...layoutHotkeys,
    "? help",
    "q quit"
  ]
  return (
    <Box height={1}>
      {hotkeys.map(hk => (
        <Text key={hk} backgroundColor="blue" color="white"> {hk} </Text>
      ))}
    </Box>
  )
}
```

### 6.5. Help Modal Rendering

```tsx
function HelpModal({ onClose }) {
  const panels = PanelRegistry.getAll()
  return (
    <Box borderStyle="round" padding={1} flexDirection="column">
      <Text bold>Hotkeys</Text>
      <Box marginTop={1}>
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

## 7. Layout Registry & Renderer

### 7.1. Layout Definition

```ts
interface LayoutDefinition {
  id: string
  component: React.ComponentType<LayoutProps>
  defaultLayoutProps?: Record<string, unknown>
}

interface LayoutProps {
  layoutProps: Record<string, unknown>
  children: React.ReactNode
  width: number
  height: number
  state: AppState
  dispatch: Dispatch<AppAction>
  focusPath: number[]    // current focus path within this layout
  onFocusChange: (path: number[]) => void
}
```

### 7.2. Built-in Layouts

**`TabsLayout`** — renders children as tabs with a tab bar
- Props: `{ tabPosition?: "top" | "bottom" }` (default: `"top"`)
- Behavior: Shows one child at a time. Tab bar displays panel titles. Keyboard: `tab`/`shift+tab` or `←`/`→` to switch tabs.
- Focus: The active tab index is the first element of the focus path.

**`SplitLayout`** — splits area into two children with a configurable ratio
- Props: `{ ratio: number, direction?: "horizontal" | "vertical" }` (default: `"horizontal"`)
- Behavior: `ratio` is a number between 0 and 1 (default: 0.5). Divides `width`/`height` accordingly.
- Keyboard: No default navigation; focus is on the active child.
- Focus: The active child index is the first element of the focus path.

### 7.3. Layout Renderer

```tsx
function LayoutRenderer({ node, state, dispatch, width, height, focusPath, onFocusChange }) {
  if (node.type === "panel") {
    const panel = PanelRegistry.get(node.id)
    return (
      <PanelChrome title={panel.title} width={width} height={height}>
        <panel.component
          state={state}
          dispatch={dispatch}
          width={width}
          height={height}
        />
      </PanelChrome>
    )
  }

  const layout = LayoutRegistry.get(node.layout)
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
      {node.children.map((child, i) => (
        <LayoutRenderer
          key={i}
          node={child}
          state={state}
          dispatch={dispatch}
          width={computeChildWidth(layout, node.props, i, width, height)}
          height={computeChildHeight(layout, node.props, i, width, height)}
          focusPath={focusPath.slice(1)}
          onFocusChange={(subPath) => onFocusChange([i, ...subPath])}
        />
      ))}
    </layout.component>
  )
}
```

### 7.4. Focus Path

Focus is tracked as an array of indices into the tree. For example, `[1, 0]` means:
- Root layout's child at index 1
- That child's child at index 0

Each layout shell handles its own navigation (e.g., `TabsLayout` switches tabs on arrow keys, `SplitLayout` does not consume arrow keys). Focus is passed down the tree via `focusPath` and `onFocusChange`.

### 7.5. Global Keyboard Handling

The `App` component handles global hotkeys (not individual layouts):
- `q` / `ctrl+c` — quit
- `?` — toggle help dialog
- `tab` / `shift+tab` — navigate focus forward/backward through the layout tree (delegated to the focused layout)

Layouts consume keyboard events only for their own navigation. A `TabsLayout` consumes `←`/`→` to switch tabs. A `SplitLayout` does not consume arrow keys — they pass through to the focused child panel.

Panel-specific hotkeys (e.g., `d` for daemon view in Logs) are handled by the focused panel component directly using ink's `useInput` hook.

## 8. Config Integration

### 8.1. Config Evaluation

The TUI config loader evaluates the `tui.layout` function:

```ts
const Layout = (props: LayoutProps) => ({
  type: "layout" as const,
  layout: props.type,
  props: omit(props, "type", "children"),
  children: props.children ?? []
})

const Panel = (props: PanelProps) => ({
  type: "panel" as const,
  id: props.id
})

const layoutTree = config.tui?.layout?.({ Layout, Panel })
```

If no `tui.layout` is defined, the TUI falls back to a default `TabsLayout` with all 5 built-in panels in order:

```ts
const defaultLayout = {
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
```

### 8.2. Validation

Before rendering, the tree is validated:
- Every panel node must reference a registered panel ID
- Every layout node must reference a registered layout ID
- Every layout node must have at least one child
- `SplitLayout` must have exactly 2 children
- `TabsLayout` must have at least 1 child

Validation errors are displayed in the TUI as a fallback panel with the error message.

## 9. Data Flow

### 9.1. Central Store

`StoreContext` holds shared data:
- `session: Session | null`
- `spans: Span[]`
- `events: Event[]`
- `context: ContextItem[]`
- `daemonEvents: Event[]`

The `App` component subscribes to the SDK and updates the store. The central reducer is simplified: it only handles global state updates (snapshots, incoming events). Panel-specific state (selection indices, filters, scroll position) is removed from the reducer.

### 9.2. Panel-Local State

Panels manage their own state using `useState`:
- `AgentsPanel`: `selectedIndex`, `sortOrder`
- `LogsPanel`: `selectedIndex`, `filter`, `autoScroll`, `view`
- `TracesPanel`: `selectedIndex`, `expandedNodes`
- `ContextPanel`: `selectedIndex`, `groupBy`

### 9.3. Panel-Specific Subscriptions

The `LogsPanel` currently subscribes to daemon events. This moves into the panel component:

```tsx
function LogsPanel({ state, dispatch, width, height }) {
  const [daemonEvents, setDaemonEvents] = useState<Event[]>([])
  useEffect(() => {
    const client = createClient()
    const unsub = client.subscribe(DAEMON_SESSION_ID, ...)
    return () => { unsub(); client.close() }
  }, [])
  // ...
}
```

## 10. Shared UI Components

These are extracted from existing tab components and made reusable:

- `PanelChrome` — border, title bar, optional scroll indicator, min-size warnings
- `StatusBadge` — colored dot with status text (green=done, red=failed, yellow=blocked, blue=running)
- `LogLine` — timestamp + level + message + optional selection border
- `TreeNode` — indented tree with expand/collapse, depth tracking
- `SelectList` — list of items with keyboard navigation (arrow keys, enter) and selection border
- `TypeBadge` — colored badge for context item types (goal=green, url=blue, file=yellow, text=white)

## 10. Plugin Future-Proofing

The architecture is designed so that adding a plugin system later is straightforward:

- **PanelRegistry** can accept new registrations. A plugin would call `PanelRegistry.register({ id, title, component, ... })` after loading.
- **LayoutRegistry** can accept new registrations. A plugin could add custom layouts (e.g., a `SidebarLayout`).
- **Config evaluation** is already injectable. The `tui.layout` function receives primitives; a plugin could extend the primitives object to add new data constructors.
- **No changes required** to the core renderer or config loader to support plugin panels. The only missing piece is the plugin loading mechanism (which is out of scope for this design).

## 11. Migration Path

### Phase 1: Fullscreen Mode
- Enable fullscreen mode in `App` using `ink`'s fullscreen or raw mode
- Handle terminal resize events to update `stdout.columns` and `stdout.rows`
- Ensure terminal state is restored on exit (clear screen, reset cursor)
- Test fullscreen behavior on different terminal sizes

### Phase 2: Extract Shared Components
- Extract `StatusBadge`, `LogLine`, `TreeNode`, `SelectList`, `TypeBadge` from existing tabs
- Extract `PanelChrome` from tab borders

### Phase 3: Create Panel Registry & Convert Tabs
- Create `PanelRegistry` with `register` / `get` / `getAll`
- Convert each `*Tab.tsx` into a `panels/*Panel.tsx`:
  - Move panel-specific state from reducer into component local state
  - Extract panel-specific subscriptions into component hooks
  - Register the panel in the registry with `hotkeys` metadata
- Update `Header.tsx` to read tab names from the layout tree instead of hardcoding
- Update `Footer.tsx` to be always visible and show hotkeys from the focused panel
- Create `HelpModal` component that renders all hotkeys grouped by panel
- Update `App.tsx` to handle `?` key for toggling the help modal overlay

### Phase 4: Create Layout Registry & Renderer
- Create `LayoutRegistry` with built-in `TabsLayout` and `SplitLayout`
- Implement `LayoutRenderer` with recursive rendering
- Implement focus path tracking and keyboard navigation

### Phase 5: Config Integration
- Add `tui.layout` support to the config loader
- Implement Layout/Panel data constructors
- Add layout tree validation
- Add default fallback (tabs with all panels)

### Phase 6: Cleanup
- Remove hardcoded tab rendering from `app.tsx`
- Remove panel-specific state from the central reducer
- Remove hardcoded tab keyboard handling from `app.tsx`
- Update tests

## 12. Testing Strategy

- **Unit tests:**
  - `PanelRegistry` — register, get, duplicate ID handling, hotkeys registration
  - `LayoutRegistry` — register, get, defaultLayoutProps
  - `LayoutRenderer` — renders panel nodes, renders layout nodes, validates invalid panel IDs
  - Layout tree validation — missing children, invalid IDs, wrong child count for SplitLayout
  - Data constructors (`Layout`, `Panel`) — correct JSON output
  - Fullscreen — terminal state is restored on exit, resize events are captured
  - Footer — shows hotkeys for focused panel, always visible
  - HelpModal — renders all hotkeys grouped by panel, overlay on top of layout

- **Integration tests:**
  - Config evaluation — `tui.layout` function receives primitives and returns valid tree
  - Default fallback — when no `tui.layout` is defined, renders tabs with all panels
  - Keyboard navigation — tabs switch with tab/shift-tab, split layout does not consume arrow keys
  - Panel-local state — panel state is isolated and does not leak into other panels
  - Fullscreen — app enters and exits fullscreen correctly
  - Footer — updates hotkeys when focus changes
  - Help modal — toggles on `?` key, shows all registered panel hotkeys

- **Visual tests:**
  - Each layout shell renders correctly with ink's `render` + `stdout.columns/rows` mocked
  - Panel chrome renders borders and titles correctly
  - Fullscreen — app renders at full terminal dimensions
  - Footer — renders at bottom of screen, shows correct hotkeys
  - Help modal — renders as overlay, covers layout content

## 13. Example Configs

### Default (tabs)
```tsx
export default {
  tui: {
    layout: ({ Layout, Panel }) => (
      <Layout type="tabs">
        <Panel id="overview" />
        <Panel id="context" />
        <Panel id="agents" />
        <Panel id="traces" />
        <Panel id="logs" />
      </Layout>
    )
  }
}
```

### Split screen with agents + logs
```tsx
export default {
  tui: {
    layout: ({ Layout, Panel }) => (
      <Layout type="split" ratio={0.4} direction="vertical">
        <Panel id="agents" />
        <Panel id="logs" />
      </Layout>
    )
  }
}
```

### Nested: tabs with a split tab
```tsx
export default {
  tui: {
    layout: ({ Layout, Panel }) => (
      <Layout type="tabs">
        <Panel id="overview" />
        <Layout type="split" ratio={0.5}>
          <Panel id="traces" />
          <Panel id="logs" />
        </Layout>
        <Panel id="agents" />
      </Layout>
    )
  }
}
```

## 14. Open Questions (Resolved During Design)

| Question | Decision |
|----------|----------|
| Layout type? | Grid-based dashboard + tab-based flexibility |
| Plugin scope? | Architect for future plugins only; do not design the full plugin API now |
| Panel data model? | Hybrid: context for shared data, hooks for panel-specific |
| Config imports? | Zero imports: function-based with injected primitives |
| Panel registry owner? | TUI owns the registry |
| Layout abstraction? | `@adler/ui` package with JSX constructors (not needed; primitives are injected) |
| Initial layouts? | `TabsLayout` and `SplitLayout` (with ratio) |
| Fullscreen? | Yes, fullscreen is the default and only mode |
| Footer? | Always visible, shows hotkeys for focused panel |
| Help dialog? | Modal overlay, shows all hotkeys grouped by panel |
| Hotkey registration? | Panels register hotkeys in PanelDefinition; TUI reads from registry for footer/help |
