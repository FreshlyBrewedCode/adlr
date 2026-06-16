# Visual TUI Redesign — Design Spec

**Date:** 2026-06-16
**Status:** Approved
**Scope:** Visual redesign of the adler TUI panel shells, shared components, and header/footer chrome.

---

## 1. Goals

1. **Panel shells** should feel like lazygit — clean rounded borders, proper title bars, subtle padding.
2. **Shared UI components** should be visually cohesive — consistent colors, spacing, and visual hierarchy.
3. **Header and footer** should match the mockup aesthetic — clean top bar, muted hotkey pills.
4. **New `Card` component** should be reusable across panels for rich content items (agents, traces, etc.).
5. **Centralized theme** should make future color changes trivial and guarantee consistency.

Out of scope: functional behavior changes (keyboard handling, data flow, layout system). This is a purely visual redesign.

---

## 2. Theme System

A single `Theme` object in `packages/tui/src/theme.ts` that all components import.

```typescript
export const Theme = {
  // Base
  background: "black",
  foreground: "white",
  muted: "gray",
  border: "gray",

  // Semantic
  primary: "cyan",
  success: "green",
  error: "red",
  warning: "yellow",
  running: "blue",
  info: "blue",

  // UI chrome
  header: {
    session: "cyan",
    status: {
      active: "green",
      completed: "gray",
    },
  },
  footer: {
    badgeBg: "gray",
    badgeText: "white",
    separator: "gray",
  },
  panel: {
    title: "cyan",
    border: "gray",
    activeBorder: "cyan",
  },

  // Data
  status: {
    done: "green",
    failed: "red",
    blocked: "yellow",
    running: "blue",
    pending: "gray",
  },
  type: {
    goal: "green",
    url: "blue",
    file: "yellow",
    text: "white",
  },
  level: {
    info: "green",
    warn: "yellow",
    error: "red",
    other: "white",
  },
} as const
```

All components reference `Theme.status.done` instead of hardcoded `"green"`. No component should define its own color constants.

---

## 3. PanelChrome

`packages/tui/src/components/PanelChrome.tsx`

### Design
- `borderStyle="round"` with single-line rounded corners
- Border color: `Theme.panel.border` (gray) when inactive
- Border color: `Theme.panel.activeBorder` (cyan) when the panel is focused
- `padding={1}` on all sides so content doesn't touch the border
- Title rendered via Ink's built-in `label` prop on the border `Box`
- Title color: `Theme.panel.title` (cyan)

### Props
```typescript
interface PanelChromeProps {
  title: string
  width: number
  height: number
  isFocused?: boolean
  children: React.ReactNode
}
```

### Example
```tsx
<Box
  borderStyle="round"
  borderColor={isFocused ? Theme.panel.activeBorder : Theme.panel.border}
  label={<Text color={Theme.panel.title}>{title}</Text>}
  padding={1}
  width={width}
  height={height}
>
  {children}
</Box>
```

---

## 4. Header

`packages/tui/src/components/Header.tsx`

### Design
Single row, clean, minimal:
- `adler` in bold
- `session:` label dimmed
- Session ID (6 chars) in `Theme.primary` (cyan)
- Status colored: `active` = green, `completed` = gray
- Working dir dimmed

### Format
```
adler · session: abc123 · active · ~/git/myapp
```

### Code
```tsx
export function Header({ session }: { session: Session | null }) {
  const statusColor = session?.status === "active"
    ? Theme.header.status.active
    : Theme.header.status.completed
  return (
    <Box height={1}>
      <Text bold>adler</Text>
      <Text dimColor> · session: </Text>
      <Text color={Theme.primary}>{session?.id.slice(0, 6)}</Text>
      <Text dimColor> · </Text>
      <Text color={statusColor}>{session?.status}</Text>
      <Text dimColor> · {session?.working_dir}</Text>
    </Box>
  )
}
```

---

## 5. Footer

`packages/tui/src/components/Footer.tsx`

### Design
Always 1 row at the bottom.
- Left side: hotkey pills. Each pill is a `backgroundColor="gray"` `Text` block with `color="white"`. Pills separated by a single space.
- Right side: current panel title in dimmed text.

### Format
```
[↑↓ navigate] [enter attach] [? help] [q quit]                  Agents
```

### Code
```tsx
export function Footer({ focusedPanelId }: { focusedPanelId: string | null }) {
  const panel = focusedPanelId ? PanelRegistry.get(focusedPanelId) : null
  const hotkeys = [
    ...(panel?.hotkeys?.map(h => `${h.key} ${h.description}`) ?? []),
    "? help",
    "q quit",
  ]
  return (
    <Box height={1} justifyContent="space-between">
      <Box>
        {hotkeys.map((hk, i) => (
          <Box key={i} marginRight={1}>
            <Text backgroundColor={Theme.footer.badgeBg} color={Theme.footer.badgeText}>
              {" "}{hk}{" "}
            </Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>{panel?.title ?? "No panel focused"}</Text>
    </Box>
  )
}
```

---

## 6. Card

`packages/tui/src/components/Card.tsx`

### Design
A reusable content item with a strong visual identity:
- Left border strip (2 chars wide) colored by status. Uses `│` in the status color.
- Internal padding (1 on all sides).
- Rounded corners via `borderStyle="round"` on the card itself.
- Title row: bold, status-colored.
- Description row: dimmed.
- Optional footer hint row: very dimmed (e.g., `enter → suspend TUI, stream live PTY`).
- Selected state: border color switches to `Theme.primary` (cyan).

### Props
```typescript
interface CardProps {
  title: string
  description?: string
  status: "done" | "failed" | "blocked" | "running" | "pending"
  hint?: string
  isSelected?: boolean
  width?: number
  children?: React.ReactNode
}
```

### Code
```tsx
export function Card({
  title,
  description,
  status,
  hint,
  isSelected,
  width,
  children,
}: CardProps) {
  const statusColor = Theme.status[status]
  return (
    <Box
      width={width}
      borderStyle="round"
      borderColor={isSelected ? Theme.primary : undefined}
      flexDirection="row"
    >
      <Box width={2} flexDirection="column">
        <Text color={statusColor}>│</Text>
      </Box>
      <Box flexDirection="column" padding={1}>
        <Text bold color={statusColor}>{title}</Text>
        {description && <Text dimColor>{description}</Text>}
        {children}
        {hint && <Text dimColor> {hint}</Text>}
      </Box>
    </Box>
  )
}
```

### Usage
Used in `AgentsPanel` for each agent. Potentially reusable in `TracesPanel` and `OverviewPanel`.

---

## 7. StatusBadge

`packages/tui/src/components/StatusBadge.tsx`

### Design
Minimal: colored dot (●) + status text.

```tsx
export function StatusBadge({ status }: { status: string }) {
  const color = Theme.status[status as keyof typeof Theme.status] ?? Theme.muted
  return <Text color={color}>● {status}</Text>
}
```

---

## 8. TypeBadge

`packages/tui/src/components/TypeBadge.tsx`

### Design
Background-colored badge with black text. Like a subtle tag.

```tsx
export function TypeBadge({ type }: { type: string }) {
  const bg = Theme.type[type as keyof typeof Theme.type] ?? Theme.muted
  return (
    <Text backgroundColor={bg} color="black">
      {" "}{type.toUpperCase()}{" "}
    </Text>
  )
}
```

---

## 9. LogLine

`packages/tui/src/components/LogLine.tsx`

### Design
Better spacing and visual hierarchy:
- Timestamp: dimmed
- Level badge: `backgroundColor` with the level color, `color="black"`, uppercase
- Event type: normal
- Message: dimmed
- Selected row: `backgroundColor="gray"`

```tsx
export function LogLine({ event, isSelected }: { event: Event; isSelected: boolean }) {
  const level = levelFromType(event.type)
  const color = Theme.level[level]
  const message = (event.data?.message as string) ?? JSON.stringify(event.data)
  return (
    <Box backgroundColor={isSelected ? "gray" : undefined}>
      <Text dimColor>{new Date(event.timestamp).toLocaleTimeString()} </Text>
      <Text backgroundColor={color} color="black"> {level.toUpperCase()} </Text>
      <Text> {event.type}</Text>
      <Text dimColor> {message}</Text>
    </Box>
  )
}
```

---

## 10. TreeNode

`packages/tui/src/components/TreeNode.tsx`

### Design
- Indentation with spaces (2 per depth)
- Colored indicator: `●` for agents, `○` for other kinds
- Name: normal
- Status: dimmed
- Selected row: `backgroundColor="gray"`

```tsx
export function TreeNode({
  span,
  depth,
  isSelected,
}: {
  span: Span
  depth: number
  isSelected: boolean
}) {
  const statusColor = Theme.status[span.status as keyof typeof Theme.status] ?? Theme.muted
  const indicator = span.kind === "agent" ? "●" : "○"
  return (
    <Box backgroundColor={isSelected ? "gray" : undefined}>
      <Text>{"  ".repeat(depth)}</Text>
      <Text color={statusColor}>{indicator} </Text>
      <Text>{span.name}</Text>
      <Text dimColor> {span.status}</Text>
    </Box>
  )
}
```

---

## 11. SelectList

`packages/tui/src/components/SelectList.tsx`

### Design
No more full border on each row. Selected row gets a subtle background highlight.

```tsx
export function SelectList({
  items,
  selectedIndex,
  renderItem,
}: {
  items: unknown[]
  selectedIndex: number
  renderItem: (item: unknown, index: number, isSelected: boolean) => React.ReactNode
}) {
  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Box key={i} backgroundColor={i === selectedIndex ? "gray" : undefined}>
          {renderItem(item, i, i === selectedIndex)}
        </Box>
      ))}
    </Box>
  )
}
```

---

## 12. HelpModal

`packages/tui/src/components/HelpModal.tsx`

### Design
Clean overlay centered on screen.
- `borderStyle="round"` with `borderColor={Theme.primary}`
- Title: bold, primary color
- Section headers: bold, underlined, primary color
- Key bindings: plain text

```tsx
export function HelpModal({ onClose }: { onClose: () => void }) {
  const panels = PanelRegistry.getAll()
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={Theme.primary}
      padding={1}
      width={60}
      height={20}
    >
      <Text bold color={Theme.primary}>Hotkeys</Text>
      <Box flexDirection="column" marginTop={1}>
        <Text bold underline>Global</Text>
        <Text>tab / shift+tab — next / prev focus</Text>
        <Text>q / ctrl+c — quit</Text>
        <Text>? — toggle help</Text>
      </Box>
      {panels.map(panel => (
        <Box key={panel.id} marginTop={1} flexDirection="column">
          <Text bold underline color={Theme.primary}>{panel.title}</Text>
          {panel.hotkeys?.map(hk => (
            <Text key={hk.key}>{hk.key} — {hk.description}</Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
```

---

## 13. Updated Panels

### AgentsPanel

Uses the new `Card` component for each agent. Each card shows:
- Title: agent name
- Description: prompt preview (truncated to 40 chars)
- Status: from span status
- Hint: `enter → suspend TUI, stream live PTY` (running) or `enter → replay stored PTY output` (done/failed)

```tsx
export function AgentsPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const agents = state.spans.filter(s => s.kind === "agent")

  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex(i => Math.max(0, i - 1))
    if (key.downArrow) setSelectedIndex(i => Math.min(agents.length - 1, i + 1))
  })

  return (
    <Box flexDirection="column" width={width} height={height}>
      <SelectList
        items={agents}
        selectedIndex={selectedIndex}
        renderItem={(span, i, isSelected) => (
          <Card
            title={span.name}
            description={String(span.data?.prompt ?? "").slice(0, 40)}
            status={span.status as any}
            hint={
              span.status === "running"
                ? "enter → suspend TUI, stream live PTY"
                : "enter → replay stored PTY output"
            }
            isSelected={isSelected}
            width={width}
          />
        )}
      />
    </Box>
  )
}
```

### ContextPanel

Uses `TypeBadge` for section headers. Cleaner grouping with better spacing.

### Other Panels

`OverviewPanel`, `TracesPanel`, and `LogsPanel` get minor updates to use `Theme` colors and the new `SelectList`/`LogLine`/`TreeNode` styling. No structural changes.

---

## 14. LayoutRenderer Integration

`packages/tui/src/core/LayoutRenderer.tsx` needs to pass `isFocused` to `PanelChrome` based on whether the current panel is in the active focus path.

The `LayoutRenderer` already receives `focusPath` and `onFocusChange`. To determine if a panel is focused, we compare the panel's tree path with the current `focusPath`. If the path ends at this panel (i.e., the panel node is the leaf of the focus path), `isFocused` is `true`.

This requires passing a `currentPath` prop down through the recursive renderer. `LayoutRenderer` currently receives `focusPath` for navigation. We add a `currentPath` array that accumulates as we recurse.

```tsx
// In LayoutRenderer props:
interface LayoutRendererProps {
  // ...existing props...
  currentPath?: number[]   // path to this node, defaults to []
}

// When rendering a panel node:
const effectivePath = currentPath ?? []
const isFocused =
  effectivePath.length === focusPath.length &&
  effectivePath.every((val, idx) => val === focusPath[idx])

// When recursing into children:
<LayoutRenderer
  // ...existing props...
  currentPath={[...effectivePath, childIndex]}
/>
```

This is a minor change to the existing renderer. The `isFocused` prop is passed to `PanelChrome`.

---

## 15. Migration Summary

| File | Action | Change |
|------|--------|--------|
| `packages/tui/src/theme.ts` | **New** | Centralized theme object |
| `packages/tui/src/components/PanelChrome.tsx` | **Rewrite** | Rounded borders, padding, focus color, title label |
| `packages/tui/src/components/Header.tsx` | **Rewrite** | Cleaner top bar, themed colors |
| `packages/tui/src/components/Footer.tsx` | **Rewrite** | Muted grey pills, right-side panel title |
| `packages/tui/src/components/Card.tsx` | **New** | Reusable card with left-border status |
| `packages/tui/src/components/StatusBadge.tsx` | **Rewrite** | Use theme |
| `packages/tui/src/components/TypeBadge.tsx` | **Rewrite** | Background badges |
| `packages/tui/src/components/LogLine.tsx` | **Rewrite** | Level badges, better spacing, selection highlight |
| `packages/tui/src/components/TreeNode.tsx` | **Rewrite** | Indentation, theme colors, selection highlight |
| `packages/tui/src/components/SelectList.tsx` | **Rewrite** | Row highlight instead of border |
| `packages/tui/src/components/HelpModal.tsx` | **Rewrite** | Cleaner overlay, theme colors |
| `packages/tui/src/components/panels/AgentsPanel.tsx` | **Update** | Use Card component |
| `packages/tui/src/components/panels/ContextPanel.tsx` | **Update** | Use TypeBadge, cleaner layout |
| `packages/tui/src/components/panels/OverviewPanel.tsx` | **Update** | Use Theme colors |
| `packages/tui/src/components/panels/TracesPanel.tsx` | **Update** | Use Theme colors, TreeNode |
| `packages/tui/src/components/panels/LogsPanel.tsx` | **Update** | Use LogLine, SelectList |
| `packages/tui/src/core/LayoutRenderer.tsx` | **Update** | Pass `isFocused` to PanelChrome |

---

## 16. Testing Notes

- All existing tests should continue to pass (no functional changes).
- Add visual snapshot tests for `PanelChrome`, `Card`, `Footer`, and `Header` if the project has ink testing infrastructure.
- Verify that `Theme` is imported by all redesigned components and no hardcoded colors remain.

---

## 17. Future Work

- The `Theme` object could be made configurable via `adler.ts` (e.g., light mode, custom accent colors).
- The `Card` component could gain additional variants (compact, horizontal, with action buttons).
- The `isFocused` handling in `LayoutRenderer` could be extended to support nested layouts (e.g., a `SplitLayout` with two panels, where only one is focused).
