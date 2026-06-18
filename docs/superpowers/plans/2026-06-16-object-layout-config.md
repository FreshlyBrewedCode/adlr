# Object-Based Layout Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the JSX/function-based layout config with a plain object tree, drop `.tsx` config support, and align the SDK types, TUI evaluation/validation, and the existing spec.

**Architecture:** The `tui.layout` field in `AdlrConfig` becomes a direct `LayoutNode` object (no function wrapper, no JSX). The TUI normalizes string shorthands to `PanelNode` objects before rendering. The config loader drops `.tsx` candidates entirely.

**Tech Stack:** TypeScript, Bun test runner (`bun:test`), `@adlr/sdk`, `@adlr/tui`

---

## File Map

| File | Change |
|------|--------|
| `packages/sdk/src/types.ts` | Replace `TreeNode`/`LayoutNode`/`PanelNode`/`LayoutPrimitives`/`TuiConfig` with new object-based types |
| `packages/daemon/src/config-loader.ts` | Remove `.tsx` from config file candidate lists |
| `packages/tui/src/core/types.ts` | Replace `LayoutNode`/`PanelNode`/`TreeNode` with new object-based types |
| `packages/tui/src/core/evaluateLayout.ts` | Delete file entirely |
| `packages/tui/src/core/validateLayout.ts` | Rewrite to handle new shape (`layout`/`panel` keys, `content`, string shorthands) |
| `packages/tui/src/core/normalizeLayout.ts` | Create: normalizes `ContentNode` (string shorthands → `PanelNode`) |
| `packages/tui/src/app.tsx` | Update `defaultLayout` to new shape; remove `evaluateLayout` import if present |
| `.adlr/adlr.tsx` | Rename to `.adlr/adlr.ts` (content already correct) |
| `packages/tui/test/core/evaluateLayout.test.ts` | Delete file |
| `packages/tui/test/core/validateLayout.test.ts` | Rewrite tests for new shape |
| `packages/tui/test/core/normalizeLayout.test.ts` | Create: tests for string shorthand normalization |
| `docs/superpowers/specs/2026-06-16-tui-panel-system-design.md` | Update sections 3.2, 8.1, 13, 14 to remove JSX and use object examples |

---

## Task 1: Update SDK types

**Files:**
- Modify: `packages/sdk/src/types.ts`

- [ ] **Step 1: Replace layout-related types**

In `packages/sdk/src/types.ts`, replace everything from `export interface LayoutNode` through `export interface TuiConfig` (lines 96–117) with:

```ts
export type ContentNode = LayoutNode | PanelNode | string

export interface LayoutNode {
  layout: string
  content: ContentNode[]
  [key: string]: unknown
}

export interface PanelNode {
  panel: string
}

export interface TuiConfig {
  layout?: LayoutNode
}
```

Remove the `LayoutPrimitives` interface entirely (lines 110–113 in the current file).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/sdk && bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/types.ts
git commit -m "feat(sdk): replace JSX layout types with plain object types"
```

---

## Task 2: Drop `.tsx` from config loader

**Files:**
- Modify: `packages/daemon/src/config-loader.ts`

- [ ] **Step 1: Remove `.tsx` candidates**

In `packages/daemon/src/config-loader.ts`, replace:

```ts
const GLOBAL_CONFIG_STEMS = [
  join(homedir(), ".config/adlr/adlr.tsx"),
  join(homedir(), ".config/adlr/adlr.ts"),
]
```

with:

```ts
const GLOBAL_CONFIG_STEMS = [
  join(homedir(), ".config/adlr/adlr.ts"),
]
```

And replace:

```ts
function projectConfigCandidates(dir: string): string[] {
  return [join(dir, ".adlr/adlr.tsx"), join(dir, ".adlr/adlr.ts")]
}
```

with:

```ts
function projectConfigCandidates(dir: string): string[] {
  return [join(dir, ".adlr/adlr.ts")]
}
```

- [ ] **Step 2: Run config loader tests**

```bash
cd packages/daemon && bun test test/config-loader.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/config-loader.ts
git commit -m "feat(daemon): drop .tsx config file support"
```

---

## Task 3: Update TUI core types

**Files:**
- Modify: `packages/tui/src/core/types.ts`

- [ ] **Step 1: Replace LayoutNode, PanelNode, TreeNode**

In `packages/tui/src/core/types.ts`, replace:

```ts
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
```

with:

```ts
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
```

`TreeNode` remains the union of normalized nodes (strings are normalized before they enter the render tree). `ContentNode` is used in config input and normalization.

- [ ] **Step 2: Check for compile errors in tui**

```bash
cd packages/tui && bun tsc --noEmit
```

Expected: TypeScript errors in files that reference the old `type: "layout"` / `type: "panel"` / `node.children` / `node.id` / `node.props` shape — these will be fixed in subsequent tasks. Note which files error.

- [ ] **Step 3: Commit**

```bash
git add packages/tui/src/core/types.ts
git commit -m "feat(tui): update core types to object-based layout shape"
```

---

## Task 4: Delete evaluateLayout and its test

**Files:**
- Delete: `packages/tui/src/core/evaluateLayout.ts`
- Delete: `packages/tui/test/core/evaluateLayout.test.ts`

- [ ] **Step 1: Delete the files**

```bash
rm packages/tui/src/core/evaluateLayout.ts
rm packages/tui/test/core/evaluateLayout.test.ts
```

- [ ] **Step 2: Confirm nothing imports evaluateLayout**

```bash
cd packages/tui && grep -r "evaluateLayout" src/ test/
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add -A packages/tui/src/core/evaluateLayout.ts packages/tui/test/core/evaluateLayout.test.ts
git commit -m "feat(tui): remove evaluateLayout — no longer needed"
```

---

## Task 5: Create normalizeLayout

**Files:**
- Create: `packages/tui/src/core/normalizeLayout.ts`
- Create: `packages/tui/test/core/normalizeLayout.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/tui/test/core/normalizeLayout.test.ts`:

```ts
import { describe, test, expect } from "bun:test"
import { normalizeLayout } from "../../src/core/normalizeLayout"

describe("normalizeLayout", () => {
  test("leaves PanelNode unchanged", () => {
    expect(normalizeLayout({ panel: "overview" })).toEqual({ panel: "overview" })
  })

  test("expands string shorthand to PanelNode", () => {
    expect(normalizeLayout("overview")).toEqual({ panel: "overview" })
  })

  test("normalizes string shorthands inside layout content", () => {
    const input = { layout: "tabs", content: ["overview", "logs"] }
    const result = normalizeLayout(input)
    expect(result).toEqual({
      layout: "tabs",
      content: [{ panel: "overview" }, { panel: "logs" }]
    })
  })

  test("recursively normalizes nested layouts", () => {
    const input = {
      layout: "split",
      ratio: 0.5,
      content: [
        "overview",
        { layout: "tabs", content: ["traces", "logs"] }
      ]
    }
    const result = normalizeLayout(input)
    expect(result).toEqual({
      layout: "split",
      ratio: 0.5,
      content: [
        { panel: "overview" },
        { layout: "tabs", content: [{ panel: "traces" }, { panel: "logs" }] }
      ]
    })
  })

  test("leaves explicit PanelNode objects unchanged inside content", () => {
    const input = { layout: "tabs", content: [{ panel: "overview" }] }
    expect(normalizeLayout(input)).toEqual({ layout: "tabs", content: [{ panel: "overview" }] })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/tui && bun test test/core/normalizeLayout.test.ts
```

Expected: FAIL — `normalizeLayout` not found.

- [ ] **Step 3: Implement normalizeLayout**

Create `packages/tui/src/core/normalizeLayout.ts`:

```ts
import type { ContentNode, LayoutNode, PanelNode, TreeNode } from "./types"

export function normalizeLayout(node: ContentNode): TreeNode {
  if (typeof node === "string") {
    return { panel: node }
  }
  if ("panel" in node) {
    return node as PanelNode
  }
  const layout = node as LayoutNode
  return {
    ...layout,
    content: layout.content.map(normalizeLayout)
  } as LayoutNode
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/tui && bun test test/core/normalizeLayout.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/core/normalizeLayout.ts packages/tui/test/core/normalizeLayout.test.ts
git commit -m "feat(tui): add normalizeLayout to expand string shorthands"
```

---

## Task 6: Rewrite validateLayout

**Files:**
- Modify: `packages/tui/src/core/validateLayout.ts`
- Modify: `packages/tui/test/core/validateLayout.test.ts`

- [ ] **Step 1: Rewrite the failing tests**

Replace `packages/tui/test/core/validateLayout.test.ts` entirely with:

```ts
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

  test("validates correct tabs tree", () => {
    const tree = {
      layout: "tabs",
      content: [{ panel: "overview" }]
    }
    expect(validateLayout(tree)).toEqual([])
  })

  test("validates correct split tree", () => {
    const tree = {
      layout: "split",
      ratio: 0.5,
      content: [{ panel: "overview" }, { panel: "logs" }]
    }
    expect(validateLayout(tree)).toEqual([])
  })

  test("detects unknown panel", () => {
    const tree = { panel: "unknown" }
    expect(validateLayout(tree)).toContain("Unknown panel: unknown")
  })

  test("detects unknown layout", () => {
    const tree = { layout: "grid", content: [{ panel: "overview" }] }
    expect(validateLayout(tree)).toContain("Unknown layout: grid")
  })

  test("detects layout with no children", () => {
    const tree = { layout: "tabs", content: [] }
    expect(validateLayout(tree)).toContain("Layout tabs must have at least one child")
  })

  test("detects split with wrong child count", () => {
    const tree = { layout: "split", content: [{ panel: "overview" }] }
    expect(validateLayout(tree)).toContain("Split layout must have exactly 2 children, got 1")
  })

  test("validates nested layouts recursively", () => {
    const tree = {
      layout: "tabs",
      content: [
        { layout: "split", content: [{ panel: "overview" }, { panel: "unknown-panel" }] }
      ]
    }
    expect(validateLayout(tree)).toContain("Unknown panel: unknown-panel")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/tui && bun test test/core/validateLayout.test.ts
```

Expected: FAIL — `validateLayout` still uses the old shape.

- [ ] **Step 3: Rewrite validateLayout**

Replace `packages/tui/src/core/validateLayout.ts` entirely with:

```ts
import type { TreeNode } from "./types"
import { PanelRegistry } from "./PanelRegistry"
import { LayoutRegistry } from "./LayoutRegistry"

export function validateLayout(node: TreeNode): string[] {
  const errors: string[] = []

  if ("panel" in node) {
    if (!PanelRegistry.get(node.panel)) {
      errors.push(`Unknown panel: ${node.panel}`)
    }
    return errors
  }

  const layout = LayoutRegistry.get(node.layout)
  if (!layout) {
    errors.push(`Unknown layout: ${node.layout}`)
    return errors
  }

  if (node.content.length === 0) {
    errors.push(`Layout ${node.layout} must have at least one child`)
  }

  if (node.layout === "split" && node.content.length !== 2) {
    errors.push(`Split layout must have exactly 2 children, got ${node.content.length}`)
  }

  for (const child of node.content) {
    errors.push(...validateLayout(child as TreeNode))
  }

  return errors
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/tui && bun test test/core/validateLayout.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/core/validateLayout.ts packages/tui/test/core/validateLayout.test.ts
git commit -m "feat(tui): rewrite validateLayout for object-based layout shape"
```

---

## Task 7: Update LayoutRenderer and app.tsx

**Files:**
- Modify: `packages/tui/src/core/LayoutRenderer.tsx`
- Modify: `packages/tui/src/app.tsx`

The `LayoutRenderer` currently discriminates on `node.type === "panel"` and accesses `node.children`, `node.props`, `node.id`. These must change to the new shape. `app.tsx`'s `defaultLayout` and `resolveFocusedPanel` also use the old shape.

- [ ] **Step 1: Read LayoutRenderer to understand full scope**

Read `packages/tui/src/core/LayoutRenderer.tsx` before editing.

- [ ] **Step 2: Update LayoutRenderer discrimination and field access**

In `LayoutRenderer.tsx`, replace all occurrences of:
- `node.type === "panel"` → `"panel" in node`
- `node.type === "layout"` → `"layout" in node`
- `node.id` (panel id) → `node.panel`
- `node.children` → `node.content`
- `node.props` (layout props) → spread the node minus `layout` and `content` keys, or pass the whole node to `layoutProps` after stripping discriminator keys

Specifically, where `layoutProps={node.props}` is passed to the layout component, replace with:

```ts
const { layout: _layout, content: _content, ...layoutProps } = node
```

And pass `layoutProps` to the component.

- [ ] **Step 3: Update app.tsx defaultLayout and resolveFocusedPanel**

In `packages/tui/src/app.tsx`:

Replace `defaultLayout`:

```ts
import type { ContentNode, TreeNode } from "./core/types"
import { normalizeLayout } from "./core/normalizeLayout"

const defaultLayout: ContentNode = {
  layout: "tabs",
  content: ["overview", "context", "agents", "traces", "logs"]
}
```

`ContentNode` is used here because the value contains string shorthands. `normalizeLayout` converts it to a `TreeNode` before use.

Replace `resolveFocusedPanel`:

```ts
function resolveFocusedPanel(node: TreeNode, focusPath: number[]): string | null {
  if ("panel" in node) return node.panel
  if (focusPath.length === 0) return null
  const childIndex = focusPath[0]
  const child = (node.content as TreeNode[])[childIndex]
  if (!child) return null
  return resolveFocusedPanel(child, focusPath.slice(1))
}
```

Also update `useState<TreeNode>(defaultLayout)` — the type is unchanged, just the value.

Note: `normalizeLayout` is already imported above with `defaultLayout`. Remove the duplicate import line if present:

```ts
const [layout] = useState<TreeNode>(() => normalizeLayout(defaultLayout) as TreeNode)
```

- [ ] **Step 4: Compile check**

```bash
cd packages/tui && bun tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run all TUI tests**

```bash
cd packages/tui && bun test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/core/LayoutRenderer.tsx packages/tui/src/app.tsx
git commit -m "feat(tui): update LayoutRenderer and App for object-based layout"
```

---

## Task 8: Rename sample config

**Files:**
- Rename: `.adlr/adlr.tsx` → `.adlr/adlr.ts`

- [ ] **Step 1: Rename and update import**

```bash
mv .adlr/adlr.tsx .adlr/adlr.ts
```

The file content already uses the correct object-based layout format and imports `AdlrConfig` from `@adlr/sdk`. The type definitions changed in Task 1, so verify the import still resolves:

```bash
bun tsc --noEmit .adlr/adlr.ts 2>&1 || true
```

(This may not be in the tsconfig — just confirm the file has no obvious syntax errors.)

- [ ] **Step 2: Commit**

```bash
git add .adlr/adlr.ts
git rm .adlr/adlr.tsx
git commit -m "chore: rename adlr.tsx to adlr.ts"
```

---

## Task 9: Update the TUI panel system spec

**Files:**
- Modify: `docs/superpowers/specs/2026-06-16-tui-panel-system-design.md`

- [ ] **Step 1: Update section 3.2 (Config)**

Replace the JSX function example in section 3.2:

```
export default {
  tui: {
    layout: ({ Layout, Panel }) => (
      <Layout type="tabs">
        ...
      </Layout>
    )
  }
}
```

with:

```ts
export default {
  tui: {
    layout: {
      layout: "tabs",
      content: ["overview", "context", "agents", "traces", "logs"]
    }
  }
}
```

And remove the paragraph: _"No imports in the config. The `Layout` and `Panel` functions are injected by the TUI at evaluation time."_

- [ ] **Step 2: Update section 3.3 (Layout Tree)**

Replace the `LayoutNode`/`PanelNode`/`TreeNode` interface block with the new shapes:

```ts
type ContentNode = LayoutNode | PanelNode | string

interface LayoutNode {
  layout: string        // layout type ID (e.g., "tabs", "split")
  content: ContentNode[]
  [key: string]: unknown // flat props: ratio, direction, etc.
}

interface PanelNode {
  panel: string         // panel ID from PanelRegistry
}

type TreeNode = LayoutNode | PanelNode  // normalized (no string shorthands)
```

- [ ] **Step 3: Update section 8.1 (Config Evaluation)**

Replace the `Layout`/`Panel` constructor code block with:

```ts
const layoutTree: TreeNode = normalizeLayout(config.tui?.layout ?? defaultLayout)
```

Remove the `Layout` / `Panel` function definitions and the `LayoutPrimitives` mention.

- [ ] **Step 4: Update section 13 (Example Configs)**

Replace all three JSX examples with their object equivalents (matching the examples in `docs/superpowers/specs/2026-06-16-object-layout-config-design.md` section 3).

- [ ] **Step 5: Update section 14 (Resolved Questions)**

Add a row to the table:

```
| Config format? | Plain object tree — no JSX, no function wrapper |
```

Change the existing `Config imports?` row decision from `"Zero imports: function-based with injected primitives"` to `"No imports needed — plain object literal"`.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-06-16-tui-panel-system-design.md
git commit -m "docs: update tui panel system spec for object-based layout config"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all tests across all packages**

```bash
cd /Users/karl/git/adlr && bun test
```

Expected: all tests pass with no failures.

- [ ] **Step 2: Full TypeScript check**

```bash
cd packages/sdk && bun tsc --noEmit
cd packages/daemon && bun tsc --noEmit
cd packages/tui && bun tsc --noEmit
```

Expected: no errors in any package.

- [ ] **Step 3: Confirm no `.tsx` config references remain**

```bash
grep -r "adlr\.tsx" packages/ .adlr/ --include="*.ts" --include="*.tsx"
```

Expected: no output.

- [ ] **Step 4: Confirm no evaluateLayout references remain**

```bash
grep -r "evaluateLayout\|LayoutPrimitives" packages/ --include="*.ts" --include="*.tsx"
```

Expected: no output.
