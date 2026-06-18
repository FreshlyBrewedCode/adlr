# Migrate ink to OpenTUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `ink` TUI framework with `@opentui/react` + `@opentui/keymap`, preserving all existing panels, layouts, and behavior while gaining OpenTUI's native rendering, focus handling, mouse/scroll support, and built-in testing utilities.

**Architecture:** The `packages/tui` package is refactored in place. The entry point switches from `ink`'s `render()` to OpenTUI's `createCliRenderer()` + `createRoot()`. All JSX components remain React but target OpenTUI's intrinsic elements (`<box>`, `<text>`, `<scrollbox>`) instead of Ink's. Global and panel-level `useInput` hooks are replaced by a single `@opentui/keymap` instance shared via `KeymapProvider` + `useBindings`. Tests are upgraded to use `createTestRenderer` from `@opentui/core/testing` instead of module mocks.

**Tech Stack:** `@opentui/core`, `@opentui/react`, `@opentui/keymap`, `@opentui/keymap/opentui`, `@opentui/keymap/react`, React 19, Bun test runner.

---

## Prerequisite: Understand the mapping

Before touching code, read this section. Ink concepts map to OpenTUI as follows:

| Ink concept | OpenTUI equivalent |
|---|---|
| `render(<App />)` from `"ink"` | `createCliRenderer()` + `createRoot(renderer).render(<App />)` |
| `<Box flexDirection="column">` | `<box style={{ flexDirection: "column" }}>` |
| `<Text color="cyan">` | `<text fg="cyan">` |
| `useInput((input, key) => ...)` | `useKeyboard((key) => ...)` from `@opentui/react` OR `useBindings(...)` from `@opentui/keymap/react` |
| `useApp().exit()` | `renderer.destroy()` |
| `useStdout()` for dimensions | `useTerminalDimensions()` from `@opentui/react` |
| Ink alt-screen setup (manual escape codes) | `screenMode: "alternate-screen"` in `createCliRenderer` options (default) — no manual escape codes needed |
| `ink-testing-library` render harness | `createTestRenderer` from `@opentui/core/testing` |
| `jsxImportSource: "ink"` in tsconfig | `jsxImportSource: "@opentui/react"` |

OpenTUI's `<box>` supports `title`, `border`, `borderStyle`, `padding`, `flexDirection`, `gap`, `width`, `height`, `backgroundColor`, `fg`, `bg` and the full CSS-flexbox subset. All layout math currently done in `splitUtils.ts` remains valid — you still compute pixel widths/heights and pass them as `style={{ width: N, height: N }}`.

OpenTUI's `<text>` does **not** support block-level flex children. Use `<box>` for layout, `<text>` for text content. Inline styled spans inside text use `<span>`.

---

## File Structure

Files to **modify**:

- `packages/tui/package.json` — swap `ink` dep for `@opentui/core`, `@opentui/react`, `@opentui/keymap`
- `packages/tui/tsconfig.json` — change `jsxImportSource` from `"ink"` to `"@opentui/react"`
- `packages/tui/src/ink-jsx-runtime.d.ts` — delete or repurpose (no longer needed)
- `packages/tui/src/index.ts` — replace `render()` from ink + manual alt-screen with `createCliRenderer()` + `createRoot()`; expose renderer for test teardown
- `packages/tui/src/app.tsx` — remove `useInput`, `useApp`, `useStdout` from ink; add `KeymapProvider`; use `useKeyboard` or `useBindings` for global keys; use `useTerminalDimensions`
- `packages/tui/src/components/layouts/TabsLayout.tsx` — replace `<Box>/<Text>` with `<box>/<text>`
- `packages/tui/src/components/layouts/SplitLayout.tsx` — same
- `packages/tui/src/components/panels/AgentsPanel.tsx` — replace `useInput` with `useBindings`
- `packages/tui/src/components/panels/ContextPanel.tsx` — same
- `packages/tui/src/components/panels/TracesPanel.tsx` — same
- `packages/tui/src/components/panels/LogsPanel.tsx` — same
- `packages/tui/src/components/Header.tsx` — replace `<Box>/<Text>`
- `packages/tui/src/components/Footer.tsx` — replace `<Box>/<Text>`, wire to keymap `useActiveKeys()`
- `packages/tui/src/components/HelpModal.tsx` — replace `<Box>/<Text>`
- `packages/tui/src/components/PanelChrome.tsx` — replace `<Box>/<Text>`, use `<box title={...} border>` for chrome
- `packages/tui/src/components/Card.tsx` — replace `<Box>/<Text>`
- `packages/tui/src/components/SelectList.tsx` — replace `<Box>/<Text>` with `<box>/<text>`; optionally use `<scrollbox>` for windowing
- `packages/tui/src/components/StatusBadge.tsx` — replace `<Text>`
- `packages/tui/src/components/TypeBadge.tsx` — same
- `packages/tui/src/components/LogLine.tsx` — same
- `packages/tui/src/components/TreeNode.tsx` — same

Files to **add**:

- `packages/tui/src/keymap.ts` — creates and exports the shared `keymap` instance (`createDefaultOpenTuiKeymap`) so it can be imported by `index.ts` and used in `app.tsx`

Files to **delete**:

- `packages/tui/src/ink-jsx-runtime.d.ts` — no longer needed after jsxImportSource changes

Tests to **modify**:

- `packages/tui/test/index.test.ts` — rewrite to use `createTestRenderer`; remove module mocks for ink; verify renderer lifecycle

---

## Task 1: Install OpenTUI packages and update tsconfig

**Files:**
- Modify: `packages/tui/package.json`
- Modify: `packages/tui/tsconfig.json`

- [ ] **Step 1: Write the failing type-check test**

  There is no unit test for package deps — we'll verify via `tsc --noEmit` in a later step. For now, write a sanity import test that will fail until the packages are installed:

  Create `packages/tui/test/opentui-imports.test.ts`:

  ```typescript
  import { test, expect } from "bun:test"

  test("@opentui/react is importable", async () => {
    const mod = await import("@opentui/react")
    expect(typeof mod.createRoot).toBe("function")
  })

  test("@opentui/core is importable", async () => {
    const mod = await import("@opentui/core")
    expect(typeof mod.createCliRenderer).toBe("function")
  })

  test("@opentui/keymap is importable", async () => {
    const mod = await import("@opentui/keymap")
    expect(typeof mod.Keymap).toBe("function")
  })
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `bun test packages/tui/test/opentui-imports.test.ts`
  Expected: FAIL — Cannot find module '@opentui/react'

- [ ] **Step 3: Update package.json**

  Replace the `dependencies` block in `packages/tui/package.json`. The current dependencies section is:

  ```json
  "dependencies": {
    "@adlr/sdk": "workspace:*",
    "ink": "7",
    "react": "^19.2.7"
  },
  ```

  Change it to:

  ```json
  "dependencies": {
    "@adlr/sdk": "workspace:*",
    "@opentui/core": "latest",
    "@opentui/react": "latest",
    "@opentui/keymap": "latest",
    "react": "^19.2.7"
  },
  ```

- [ ] **Step 4: Update tsconfig.json**

  The current `packages/tui/tsconfig.json` has `"jsxImportSource": "ink"`. Change it to:

  ```json
  {
    "extends": "../../tsconfig.json",
    "compilerOptions": {
      "jsx": "react-jsx",
      "jsxImportSource": "@opentui/react",
      "lib": ["ESNext", "DOM"],
      "strict": true
    },
    "include": ["src/**/*", "test/**/*"]
  }
  ```

  Read the current file first to preserve any other fields.

- [ ] **Step 5: Install packages**

  Run: `bun install` (from the `packages/tui` directory or repo root)
  Expected: `@opentui/core`, `@opentui/react`, `@opentui/keymap` appear in `bun.lock`

- [ ] **Step 6: Run the test to verify it passes**

  Run: `bun test packages/tui/test/opentui-imports.test.ts`
  Expected: 3 tests PASS

- [ ] **Step 7: Commit**

  ```bash
  git add packages/tui/package.json packages/tui/tsconfig.json packages/tui/test/opentui-imports.test.ts bun.lock
  git commit -m "feat(tui): add @opentui/core, react, keymap packages"
  ```

---

## Task 2: Create shared keymap module

The keymap must be created once and passed to `KeymapProvider`. It needs the renderer instance, which is created in `index.ts`. We solve this by making `keymap.ts` export a factory that accepts the renderer.

**Files:**
- Create: `packages/tui/src/keymap.ts`

- [ ] **Step 1: Write a failing test**

  Create `packages/tui/test/keymap.test.ts`:

  ```typescript
  import { test, expect, mock } from "bun:test"

  test("createAdlerKeymap returns a Keymap instance", async () => {
    const { createAdlerKeymap } = await import("../src/keymap.ts")
    const { Keymap } = await import("@opentui/keymap")

    // createAdlerKeymap needs a renderer-like object
    // We use a minimal mock since we're not actually rendering
    const mockRenderer = { keyInput: { addHandler: mock(() => {}) } } as any
    const keymap = createAdlerKeymap(mockRenderer)
    expect(keymap).toBeInstanceOf(Keymap)
  })
  ```

  Run: `bun test packages/tui/test/keymap.test.ts`
  Expected: FAIL — Cannot find module or export

- [ ] **Step 2: Create `packages/tui/src/keymap.ts`**

  ```typescript
  import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
  import type { CliRenderer } from "@opentui/core"
  import type { Keymap } from "@opentui/keymap"
  import type { Renderable, KeyEvent } from "@opentui/keymap/opentui"

  export type AdlerKeymap = Keymap<Renderable, KeyEvent>

  export function createAdlerKeymap(renderer: CliRenderer): AdlerKeymap {
    return createDefaultOpenTuiKeymap(renderer)
  }
  ```

- [ ] **Step 3: Run the test to verify it passes**

  Run: `bun test packages/tui/test/keymap.test.ts`
  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  git add packages/tui/src/keymap.ts packages/tui/test/keymap.test.ts
  git commit -m "feat(tui): add shared keymap factory"
  ```

---

## Task 3: Migrate TUI entry point (index.ts)

This is the most impactful change. The current `index.ts` manually writes alt-screen escape codes, calls `ink`'s `render()`, and attaches process signal handlers. OpenTUI handles all of this internally.

**Files:**
- Modify: `packages/tui/src/index.ts`
- Modify: `packages/tui/test/index.test.ts`
- Delete: `packages/tui/src/ink-jsx-runtime.d.ts`

- [ ] **Step 1: Read the current index.ts**

  Read `packages/tui/src/index.ts` fully before editing.

- [ ] **Step 2: Read the current index.test.ts**

  Read `packages/tui/test/index.test.ts` fully before editing.

- [ ] **Step 3: Write the new index.test.ts**

  The current tests mock ink and check for escape codes. Replace with tests that verify OpenTUI lifecycle. The new tests should:
  1. Test that `runTui()` creates a renderer and renders App
  2. Test that `runTui()` returns a cleanup function that destroys the renderer
  3. Not require mocking OpenTUI (use `createTestRenderer` instead)

  **Important:** `createCliRenderer` uses native FFI and cannot run in unit tests. We mock it. Write the test as:

  ```typescript
  import { test, expect, mock, beforeEach, afterEach } from "bun:test"

  // Mock OpenTUI before import
  const mockRenderer = {
    destroy: mock(() => {}),
    on: mock(() => {}),
    isDestroyed: false,
  }

  const mockRoot = {
    render: mock(() => {}),
  }

  mock.module("@opentui/core", () => ({
    createCliRenderer: mock(async () => mockRenderer),
  }))

  mock.module("@opentui/react", () => ({
    createRoot: mock(() => mockRoot),
  }))

  mock.module("../src/keymap.ts", () => ({
    createAdlerKeymap: mock(() => ({})),
  }))

  mock.module("../src/loadConfig.ts", () => ({
    loadConfig: mock(async () => ({})),
  }))

  mock.module("../src/app.tsx", () => ({
    default: () => null,
  }))

  mock.module("@adlr/sdk", () => ({
    resolveSessionId: mock(() => "test-session"),
  }))

  beforeEach(() => {
    mockRenderer.destroy.mockClear()
    mockRoot.render.mockClear()
  })

  test("runTui creates a renderer in alternate-screen mode", async () => {
    const { runTui } = await import("../src/index.ts")
    await runTui()
    const { createCliRenderer } = await import("@opentui/core")
    expect(createCliRenderer).toHaveBeenCalledWith(
      expect.objectContaining({ screenMode: "alternate-screen" }),
    )
  })

  test("runTui renders App into the root", async () => {
    const { runTui } = await import("../src/index.ts")
    await runTui()
    expect(mockRoot.render).toHaveBeenCalled()
  })

  test("runTui returns a cleanup function that destroys the renderer", async () => {
    const { runTui } = await import("../src/index.ts")
    const cleanup = await runTui()
    expect(typeof cleanup).toBe("function")
    cleanup()
    expect(mockRenderer.destroy).toHaveBeenCalled()
  })
  ```

  Run: `bun test packages/tui/test/index.test.ts`
  Expected: FAIL (import errors or test failures)

- [ ] **Step 4: Rewrite `packages/tui/src/index.ts`**

  ```typescript
  import React from "react"
  import { createCliRenderer } from "@opentui/core"
  import { createRoot } from "@opentui/react"
  import { createAdlerKeymap } from "./keymap.ts"
  import { loadConfig } from "./loadConfig.ts"
  import App from "./app.tsx"
  import { resolveSessionId } from "@adlr/sdk"

  export async function runTui(): Promise<() => void> {
    const sessionId = resolveSessionId(process.env.ADLR_SESSION)
    const config = await loadConfig(process.cwd())

    const renderer = await createCliRenderer({
      screenMode: "alternate-screen",
      exitOnCtrlC: false, // We handle ctrl+c via keymap
    })

    const keymap = createAdlerKeymap(renderer)

    createRoot(renderer).render(
      React.createElement(App, { sessionId, config, keymap }),
    )

    return () => {
      renderer.destroy()
    }
  }
  ```

  **Note:** `resolveSessionId` may not exist in `@adlr/sdk` — read `packages/sdk/src/index.ts` to find the actual export for getting the session ID (the current `index.ts` reads `process.env.ADLR_SESSION` or `.adlr/.session`). Copy the inline session resolution logic from the old `index.ts` if there is no dedicated export.

- [ ] **Step 5: Delete `packages/tui/src/ink-jsx-runtime.d.ts`**

  ```bash
  rm packages/tui/src/ink-jsx-runtime.d.ts
  ```

- [ ] **Step 6: Run the test to verify it passes**

  Run: `bun test packages/tui/test/index.test.ts`
  Expected: 3 tests PASS

- [ ] **Step 7: Commit**

  ```bash
  git add packages/tui/src/index.ts packages/tui/test/index.test.ts
  git rm packages/tui/src/ink-jsx-runtime.d.ts
  git commit -m "feat(tui): migrate entry point from ink to opentui"
  ```

---

## Task 4: Migrate app.tsx (global keyboard + layout root)

The current `app.tsx` uses `useInput`, `useApp`, and `useStdout` from `ink`. These are replaced by `useKeyboard` from `@opentui/react` (for simple event handling) and `useBindings` from `@opentui/keymap/react` (for named commands). The `KeymapProvider` must wrap the tree.

**Files:**
- Modify: `packages/tui/src/app.tsx`

- [ ] **Step 1: Read the current app.tsx fully**

  Read `packages/tui/src/app.tsx`.

- [ ] **Step 2: Write app.tsx**

  Key changes:
  - Remove all `ink` imports
  - Accept `keymap` prop (type `AdlerKeymap` from `./keymap.ts`)
  - Wrap return in `<KeymapProvider keymap={keymap}>`
  - Replace `useInput` with `useBindings` for global hotkeys
  - Replace `useApp().exit()` with `renderer.destroy()` — pass `renderer` as prop or use a ref from context
  - Replace `useStdout()` for terminal width/height with `useTerminalDimensions()` from `@opentui/react`
  - Replace `<Box>` with `<box>`, `<Text>` with `<text>`

  Read the current `app.tsx` import list carefully. The `AppProps` interface will need a `keymap` field and a `renderer` field added.

  ```typescript
  /** @jsxImportSource @opentui/react */
  import { useReducer, useEffect } from "react"
  import { useTerminalDimensions, useRenderer } from "@opentui/react"
  import { KeymapProvider, useBindings } from "@opentui/keymap/react"
  import type { AdlerKeymap } from "./keymap.ts"
  import { reducer, initialState } from "./types.ts"
  import { loadConfig } from "./loadConfig.ts"
  import { LayoutRenderer } from "./core/LayoutRenderer.tsx"
  import { registerPanels } from "./components/panels/index.ts"
  import { registerLayouts } from "./components/layouts/index.ts"
  import { Header } from "./components/Header.tsx"
  import { Footer } from "./components/Footer.tsx"
  import { HelpModal } from "./components/HelpModal.tsx"
  import { normalizeLayout } from "./core/normalizeLayout.ts"
  import type { AdlrConfig } from "@adlr/sdk"

  // Register panels and layouts once at module load
  registerPanels()
  registerLayouts()

  const DEFAULT_LAYOUT = {
    layout: "tabs",
    content: ["overview", "context", "agents", "traces", "logs"],
  }

  interface AppProps {
    sessionId: string
    config: AdlrConfig
    keymap: AdlerKeymap
  }

  export default function App({ sessionId, config, keymap }: AppProps) {
    const [state, dispatch] = useReducer(reducer, initialState)
    const renderer = useRenderer()
    const { width, height } = useTerminalDimensions()
    const [showHelp, setShowHelp] = useReducer((s: boolean) => !s, false)
    const [focusIndex, setFocusIndex] = useReducer(
      (s: number, action: "next" | "prev") =>
        action === "next" ? Math.min(s + 1, 4) : Math.max(s - 1, 0),
      0,
    )

    // Subscribe to IPC (same logic as current app.tsx, unchanged)
    useEffect(() => {
      // ... copy IPC subscription from current app.tsx lines 41-116
    }, [sessionId])

    // Global keymap bindings
    useBindings(
      () => ({
        commands: [
          { name: "toggle-help", run() { setShowHelp() } },
          { name: "quit", run() { renderer.destroy() } },
          { name: "next-panel", run() { setFocusIndex("next") } },
          { name: "prev-panel", run() { setFocusIndex("prev") } },
        ],
        bindings: [
          { key: "?", cmd: "toggle-help" },
          { key: "q", cmd: "quit" },
          { key: "ctrl+c", cmd: "quit" },
          { key: "tab", cmd: "next-panel" },
          { key: "shift+tab", cmd: "prev-panel" },
        ],
      }),
      [],
    )

    const layout = config.tui?.layout
      ? normalizeLayout(config.tui.layout)
      : normalizeLayout(DEFAULT_LAYOUT)

    const focusPath = [focusIndex]

    return (
      <KeymapProvider keymap={keymap}>
        <box style={{ flexDirection: "column", width, height }}>
          <Header state={state} />
          <box style={{ flex: 1 }}>
            <LayoutRenderer
              node={layout}
              state={state}
              dispatch={dispatch}
              width={width}
              height={height - 2} // subtract header and footer rows
              focusPath={focusPath}
            />
          </box>
          {showHelp && <HelpModal onClose={setShowHelp} />}
          <Footer state={state} focusPath={focusPath} />
        </box>
      </KeymapProvider>
    )
  }
  ```

  **Important:** Copy the IPC subscription logic exactly from the current `app.tsx` (lines 41–116). It uses `@adlr/sdk` IPC client and is not ink-specific — it just needs the `dispatch` function.

- [ ] **Step 3: Run type check**

  Run: `cd packages/tui && bunx tsc --noEmit`
  Expected: 0 errors (fix any that appear before proceeding)

- [ ] **Step 4: Commit**

  ```bash
  git add packages/tui/src/app.tsx
  git commit -m "feat(tui): migrate app.tsx to opentui + keymap"
  ```

---

## Task 5: Migrate primitive components

Migrate the 8 primitive display components. These are small and mechanical — replace `<Box>` with `<box>`, `<Text color="x">` with `<text fg="x">`. Do them all in one commit.

**Files:**
- Modify: `packages/tui/src/components/Header.tsx`
- Modify: `packages/tui/src/components/Footer.tsx`
- Modify: `packages/tui/src/components/HelpModal.tsx`
- Modify: `packages/tui/src/components/PanelChrome.tsx`
- Modify: `packages/tui/src/components/Card.tsx`
- Modify: `packages/tui/src/components/SelectList.tsx`
- Modify: `packages/tui/src/components/StatusBadge.tsx`
- Modify: `packages/tui/src/components/TypeBadge.tsx`
- Modify: `packages/tui/src/components/LogLine.tsx`
- Modify: `packages/tui/src/components/TreeNode.tsx`

- [ ] **Step 1: Read all 10 files**

  Read each file to understand current usage before editing.

- [ ] **Step 2: Apply Ink → OpenTUI element mapping for each file**

  For every file, apply these replacements:

  | Remove import | Add nothing (OpenTUI elements are intrinsic) |
  |---|---|
  | `import { Box, Text } from "ink"` | delete |
  | `import { Box } from "ink"` | delete |
  | `import { Text } from "ink"` | delete |
  | `<Box ...>` | `<box ...>` |
  | `</Box>` | `</box>` |
  | `<Text color="...">` | `<text fg="...">` |
  | `<Text bold>` | `<text bold>` |
  | `<Text dimColor>` | `<text fg="#666">` (approximate) |
  | `<Text>` | `<text>` |
  | `</Text>` | `</text>` |

  **Ink Box props → OpenTUI box style props:**

  | Ink prop | OpenTUI equivalent |
  |---|---|
  | `flexDirection="column"` | `style={{ flexDirection: "column" }}` |
  | `flexDirection="row"` | `style={{ flexDirection: "row" }}` (default) |
  | `gap={N}` | `style={{ gap: N }}` |
  | `width={N}` | `style={{ width: N }}` |
  | `height={N}` | `style={{ height: N }}` |
  | `borderStyle="round"` | `style={{ borderStyle: "rounded" }}` |
  | `borderColor="cyan"` | `style={{ borderColor: "cyan" }}` |
  | `paddingLeft={1}` | `style={{ paddingLeft: 1 }}` |
  | `marginBottom={1}` | `style={{ marginBottom: 1 }}` |

  **PanelChrome.tsx specifically:** Replace the manual box-drawing border characters with OpenTUI's native `border` + `title` box props:

  ```tsx
  // Before (Ink manual border):
  <Box borderStyle="round" borderColor={isActive ? theme.activeBorder : theme.border}>
    <Text>{title}</Text>
    {children}
  </Box>

  // After (OpenTUI native):
  <box
    style={{
      border: true,
      borderStyle: "rounded",
      borderColor: isActive ? theme.activeBorder : theme.border,
      flexDirection: "column",
      flex: 1,
    }}
    title={title}
  >
    {children}
  </box>
  ```

  **Footer.tsx specifically:** The footer currently derives hotkeys from the `PanelRegistry` and `focusPath`. Keep this logic, but display using `<text>` instead of `<Text>`. Consider using `useActiveKeys()` from `@opentui/keymap/react` to show live-queryable key hints (optional enhancement — only if it fits cleanly; otherwise keep existing logic).

  **SelectList.tsx specifically:** Replace windowed `<Box>/<Text>` rows with `<scrollbox>` if you want native scroll support. At minimum, replace with `<box>/<text>`. If using `<scrollbox>`:
  ```tsx
  <scrollbox style={{ height, overflow: "scroll" }}>
    {items.map((item, i) => (
      <box key={i} style={{ backgroundColor: i === selected ? theme.selectedBg : undefined }}>
        <text fg={i === selected ? theme.selectedFg : undefined}>{item.label}</text>
      </box>
    ))}
  </scrollbox>
  ```

- [ ] **Step 3: Run type check**

  Run: `cd packages/tui && bunx tsc --noEmit`
  Expected: 0 errors (fix any that appear)

- [ ] **Step 4: Commit**

  ```bash
  git add packages/tui/src/components/
  git commit -m "feat(tui): migrate primitive components ink→opentui"
  ```

---

## Task 6: Migrate layout components

**Files:**
- Modify: `packages/tui/src/components/layouts/TabsLayout.tsx`
- Modify: `packages/tui/src/components/layouts/SplitLayout.tsx`

- [ ] **Step 1: Read both files**

  Read `packages/tui/src/components/layouts/TabsLayout.tsx` and `packages/tui/src/components/layouts/SplitLayout.tsx`.

- [ ] **Step 2: Migrate TabsLayout.tsx**

  Replace `<Box>/<Text>` with `<box>/<text>`. The tab bar is a horizontal row of tab labels; the active pane is rendered below. Example:

  ```tsx
  /** @jsxImportSource @opentui/react */

  export function TabsLayout({ children, layoutProps, focusPath, width, height }: LayoutProps) {
    const activeIndex = focusPath?.[0] ?? 0
    const tabTitles = layoutProps?.titles ?? []
    const tabBarHeight = 1

    return (
      <box style={{ flexDirection: "column", width, height }}>
        {/* Tab bar */}
        <box style={{ flexDirection: "row", height: tabBarHeight }}>
          {tabTitles.map((title: string, i: number) => (
            <box
              key={i}
              style={{
                paddingLeft: 1,
                paddingRight: 1,
                backgroundColor: i === activeIndex ? theme.activeTab : undefined,
              }}
            >
              <text fg={i === activeIndex ? theme.activeTabText : theme.inactiveTabText}>
                {title}
              </text>
            </box>
          ))}
        </box>
        {/* Active panel */}
        <box style={{ flex: 1 }}>
          {children[activeIndex]}
        </box>
      </box>
    )
  }
  ```

  Read the actual current file to preserve the real logic — the above is a sketch.

- [ ] **Step 3: Migrate SplitLayout.tsx**

  Replace `<Box>` with `<box>`. The split direction and computed child sizes from `splitUtils.ts` stay the same.

  ```tsx
  /** @jsxImportSource @opentui/react */

  export function SplitLayout({ children, layoutProps, width, height }: LayoutProps) {
    const direction = layoutProps?.direction ?? "horizontal"
    const isHorizontal = direction === "horizontal"

    return (
      <box style={{ flexDirection: isHorizontal ? "row" : "column", width, height }}>
        {children.map((child, i) => {
          const childWidth = isHorizontal ? computeChildSize(width, children.length, i, layoutProps?.ratio) : width
          const childHeight = isHorizontal ? height : computeChildSize(height, children.length, i, layoutProps?.ratio)
          return (
            <box key={i} style={{ width: childWidth, height: childHeight }}>
              {child}
            </box>
          )
        })}
      </box>
    )
  }
  ```

- [ ] **Step 4: Run type check**

  Run: `cd packages/tui && bunx tsc --noEmit`
  Expected: 0 errors

- [ ] **Step 5: Commit**

  ```bash
  git add packages/tui/src/components/layouts/
  git commit -m "feat(tui): migrate layout components ink→opentui"
  ```

---

## Task 7: Migrate panel components (replace useInput with useBindings)

Each panel uses `useInput` from `ink` for keyboard navigation. Replace with `useBindings` from `@opentui/keymap/react`. Replace `<Box>/<Text>` with `<box>/<text>`.

**Files:**
- Modify: `packages/tui/src/components/panels/AgentsPanel.tsx`
- Modify: `packages/tui/src/components/panels/ContextPanel.tsx`
- Modify: `packages/tui/src/components/panels/TracesPanel.tsx`
- Modify: `packages/tui/src/components/panels/LogsPanel.tsx`
- Modify: `packages/tui/src/components/panels/OverviewPanel.tsx`

- [ ] **Step 1: Read all 5 panel files**

  Read each file before editing.

- [ ] **Step 2: Apply migration pattern to each panel**

  The pattern is the same for all panels. For `AgentsPanel.tsx` example:

  **Before:**
  ```tsx
  import { Box, Text, useInput } from "ink"

  useInput((input, key) => {
    if (key.upArrow) setSelectedIndex(prev => Math.max(0, prev - 1))
    if (key.downArrow) setSelectedIndex(prev => Math.min(agents.length - 1, prev + 1))
    if (key.return) { /* attach */ }
  })
  ```

  **After:**
  ```tsx
  import { useBindings } from "@opentui/keymap/react"
  // No ink import

  useBindings(
    () => ({
      commands: [
        { name: "agents:up", run() { setSelectedIndex(prev => Math.max(0, prev - 1)) } },
        { name: "agents:down", run() { setSelectedIndex(prev => Math.min(agents.length - 1, prev + 1)) } },
        { name: "agents:select", run() { /* attach */ } },
      ],
      bindings: [
        { key: "up", cmd: "agents:up" },
        { key: "down", cmd: "agents:down" },
        { key: "return", cmd: "agents:select" },
      ],
    }),
    [agents.length],
  )
  ```

  Apply the same `<Box>→<box>`, `<Text>→<text>` replacements.

  **Key mapping from Ink `key` object to OpenTUI key names:**

  | Ink | OpenTUI key name |
  |---|---|
  | `key.upArrow` | `"up"` |
  | `key.downArrow` | `"down"` |
  | `key.return` | `"return"` |
  | `key.ctrl && input === "d"` | `"ctrl+d"` |
  | `input === "d"` | `"d"` |
  | `input === "i"` | `"i"` |
  | `input === "w"` | `"w"` |
  | `input === "e"` | `"e"` |
  | `input === "f"` | `"f"` |

  For `LogsPanel.tsx` which has multiple letter key bindings, name the commands `logs:toggle-source`, `logs:filter-info`, `logs:filter-warn`, `logs:filter-error`, `logs:toggle-scroll`.

- [ ] **Step 3: Run type check**

  Run: `cd packages/tui && bunx tsc --noEmit`
  Expected: 0 errors

- [ ] **Step 4: Commit**

  ```bash
  git add packages/tui/src/components/panels/
  git commit -m "feat(tui): migrate panels ink→opentui + useBindings"
  ```

---

## Task 8: Update tests

The existing tests mock `ink` entirely. Now that `ink` is gone, the mocks are invalid. Update them to use `@opentui/core/testing` where possible and remove ink-specific mocks everywhere.

**Files:**
- Modify: `packages/tui/test/index.test.ts` (already rewritten in Task 3 — verify it still passes)
- Review: all other test files for any remaining ink references

- [ ] **Step 1: Search for remaining ink references in tests**

  Run: `grep -r "ink" packages/tui/test/`
  Expected: no output (all ink references removed)

- [ ] **Step 2: Run the full test suite**

  Run: `bun test packages/tui/`
  Expected: All previously-passing tests still pass. The 4 pre-existing failures (SOCKET_PATH / SQLiteStorage) are unrelated to this migration and should remain as-is.

- [ ] **Step 3: Verify no ink imports remain anywhere in src/**

  Run: `grep -r "from \"ink\"" packages/tui/src/`
  Expected: no output

  Run: `grep -r "from 'ink'" packages/tui/src/`
  Expected: no output

- [ ] **Step 4: Commit**

  ```bash
  git add packages/tui/test/
  git commit -m "feat(tui): update tests for opentui migration"
  ```

---

## Task 9: Smoke test and cleanup

- [ ] **Step 1: Run the complete test suite from the repo root**

  Run: `bun test`
  Expected: same pass/fail count as before this migration (90 pass, 4 fail — the 4 pre-existing SDK failures)

- [ ] **Step 2: Run type check across all packages**

  Run: `bunx tsc --noEmit` from repo root (or `cd packages/tui && bunx tsc --noEmit`)
  Expected: 0 errors

- [ ] **Step 3: Verify ink is no longer referenced anywhere**

  Run: `grep -r "from \"ink\"" packages/` 
  Expected: no output

  Run: `grep -r '"ink"' packages/tui/package.json`
  Expected: no output

- [ ] **Step 4: agent-tui live smoke test**

  This step drives the real TUI through a terminal session using `agent-tui`. It proves the renderer initialises correctly, the default layout renders visible content, and keyboard navigation works end-to-end.

  **Prerequisites:**
  - An active adlr session must exist. Check with `bun run adlr session list`. If none exists, create one with `bun run adlr new`.
  - `agent-tui` must be installed (`agent-tui --version`). If missing, install with `bun add -g agent-tui`.

  **Start the daemon if not already running:**

  ```bash
  if ! agent-tui sessions >/dev/null 2>&1; then
    tmux kill-session -t agent-tui 2>/dev/null || true
    agent-tui daemon stop 2>/dev/null || true
    rm -f /tmp/agent-tui*
    tmux new-session -d -s agent-tui 'agent-tui daemon start --foreground > /tmp/agent-tui-daemon.log 2>&1'
    sleep 1
  fi
  ```

  **Run the TUI and verify the header renders:**

  ```bash
  agent-tui run --cwd . bun -- run adlr
  ```

  Wait for the TUI to appear — the header line (`adlr ·`) must be visible:

  ```bash
  agent-tui wait "adlr" --assert
  ```

  Expected: exits 0. Failure here means the renderer did not paint or crashed on startup.

  **Take a screenshot and verify the tab bar is present:**

  ```bash
  agent-tui screenshot
  ```

  Expected output includes the tab labels: `overview`, `context`, `agents`, `traces`, `logs`.

  **Press Tab and verify focus moves to the next tab:**

  ```bash
  agent-tui press Tab
  agent-tui wait --stable
  agent-tui screenshot
  ```

  Expected: the second tab (`context`) is now highlighted/active. If all tabs look the same, the `next-panel` keymap binding is not firing.

  **Press `?` and verify the help modal opens:**

  ```bash
  agent-tui press '?'
  agent-tui wait "Hotkeys" --assert
  ```

  Expected: a help modal containing the text `Hotkeys` (or the panel list) appears on screen.

  **Press `?` again to dismiss the modal:**

  ```bash
  agent-tui press '?'
  agent-tui wait "Hotkeys" --gone --assert
  ```

  Expected: modal disappears.

  **Press `q` to quit cleanly:**

  ```bash
  agent-tui press 'q'
  agent-tui wait --stable
  ```

  Expected: TUI exits, terminal returns to normal shell prompt. If it hangs, the `quit` command in `useBindings` is not wired to `renderer.destroy()` correctly.

  **Clean up the agent-tui session:**

  ```bash
  agent-tui kill
  ```

- [ ] **Step 5: Final commit**

  ```bash
  git add -A
  git commit -m "feat(tui): complete migration from ink to opentui"
  ```

---

## Notes for the implementer

### On `useBindings` scope

`useBindings` without a `targetRef` registers a **global** layer — it fires regardless of which component has focus. This matches how `useInput` worked in Ink (global by default). If you want panel bindings to only fire when that panel is focused, you need to pass a `targetRef` pointing at the panel's root box renderable. For now, keep global scope (no `targetRef`) to match the current behavior exactly.

### On OpenTUI's `<text>` vs `<box>`

`<text>` renders inline text. It does **not** support flex children. If a current Ink `<Text>` component contains child `<Text>` components for styling, flatten them to a single `<text>` with `<span>` children, or restructure as sibling `<text>` elements inside a `<box>`.

### On alt-screen

The current `src/index.ts` manually writes `\x1b[?1049h` and `\x1b[?1049l` escape codes. Delete all of this — OpenTUI handles it internally via `screenMode: "alternate-screen"`.

### On the `_resetAltScreenForTesting` export

The current `index.ts` exports `_resetAltScreenForTesting()` for test isolation. This is no longer needed since OpenTUI manages the alt-screen lifecycle internally. Remove this export and remove any test code that calls it.

### On node compatibility

OpenTUI requires Node.js ≥ 26.3.0 with `--experimental-ffi` for native rendering, OR Bun (which has FFI built in). This project uses Bun, so no changes are needed to `adlr` launch scripts. If you see "Cannot find native module" errors, ensure you are running with `bun`, not `node`.
