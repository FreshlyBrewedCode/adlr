# Object-Based Layout Config Design

**Date:** 2026-06-16
**Status:** Approved

## 1. Goals

Replace the JSX/function-based layout config approach with a plain object tree:

- `tui.layout` is a direct `LayoutNode` object, not a function
- No JSX, no injected primitives, no `.tsx` config files
- Flat props on layout nodes (no nested `props: {}` wrapper)
- Shorthand string sugar for panel references in `content`
- Config files are `.ts` only

## 2. Changes

### 2.1. SDK Types (`packages/sdk/src/types.ts`)

Remove `TreeNode`, `LayoutNode` (old shape), `PanelNode` (old shape), and `LayoutPrimitives`. Replace with:

```ts
type ContentNode = LayoutNode | PanelNode | string

type LayoutNode = {
  layout: string          // layout type id: "tabs", "split", etc.
  content: ContentNode[]
  [key: string]: unknown  // flat props: ratio, direction, tabPosition, etc.
}

type PanelNode = {
  panel: string           // panel id: "overview", "logs", etc.
}

type TuiConfig = {
  layout?: LayoutNode     // direct object, not a function
}
```

The `layout` and `panel` keys act as discriminators. Layout props (e.g. `ratio`, `direction`) are flat on the node alongside `layout` and `content`. Per-layout prop validation belongs in the TUI's `validateLayout`, not the SDK types.

### 2.2. Config Loader (`packages/daemon/src/config-loader.ts`)

Remove `.tsx` from all config file candidate lists:

```ts
// before
const GLOBAL_CONFIG_STEMS = [
  join(homedir(), ".config/adlr/adlr.tsx"),
  join(homedir(), ".config/adlr/adlr.ts"),
]

function projectConfigCandidates(dir: string): string[] {
  return [join(dir, ".adlr/adlr.tsx"), join(dir, ".adlr/adlr.ts")]
}

// after
const GLOBAL_CONFIG_STEMS = [
  join(homedir(), ".config/adlr/adlr.ts"),
]

function projectConfigCandidates(dir: string): string[] {
  return [join(dir, ".adlr/adlr.ts")]
}
```

No runtime evaluation changes are needed — the loader already does plain `import()` with no explicit JSX handling.

### 2.3. TUI Config Evaluation (`packages/tui/src/`)

Remove `evaluateLayout`'s function-invocation path and the `Layout`/`Panel` constructor functions and `LayoutPrimitives` injection machinery entirely:

```ts
// before
const tree = config.tui?.layout?.({ Layout, Panel })

// after
const tree = config.tui?.layout ?? defaultLayout
```

Update `validateLayout` (and any normalization helpers) to handle the new shape:
- Discriminate on presence of `layout` key (layout node) vs `panel` key (panel node) vs `string` (shorthand)
- `content` replaces `children`
- Normalize string shorthands in `content` to `{ panel: string }` objects before rendering

The default layout fallback remains the same structure, expressed in the new format:

```ts
const defaultLayout: LayoutNode = {
  layout: "tabs",
  content: ["overview", "context", "agents", "traces", "logs"]
}
```

### 2.4. Sample Config (`/.adlr/adlr.tsx` → `/.adlr/adlr.ts`)

Rename the sample config file from `adlr.tsx` to `adlr.ts`. The layout section already uses the correct object format — no content changes needed beyond the rename.

### 2.5. Spec Update (`docs/superpowers/specs/2026-06-16-tui-panel-system-design.md`)

Update the existing spec to reflect the object-based approach:

- Section 3.2 (Config): Replace JSX function examples with plain object examples
- Section 8.1 (Config Evaluation): Replace `Layout`/`Panel` constructor code with direct object assignment
- Section 13 (Example Configs): Replace all JSX examples with object equivalents
- Section 14 (Resolved Questions): Add row: `Config format? | Plain object tree (no JSX, no function wrapper)`
- Remove all references to `LayoutPrimitives`, injected primitives, and JSX

## 3. Object Format Examples

### Default (tabs)
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

### Split screen
```ts
export default {
  tui: {
    layout: {
      layout: "split",
      ratio: 0.4,
      direction: "vertical",
      content: ["agents", "logs"]
    }
  }
}
```

### Nested: tabs with a split tab
```ts
export default {
  tui: {
    layout: {
      layout: "tabs",
      content: [
        "overview",
        { layout: "split", ratio: 0.5, content: ["traces", "logs"] },
        "agents"
      ]
    }
  }
}
```

### From the `.adlr/adlr.ts` sample
```ts
tui: {
  layout: {
    layout: "split",
    ratio: 0.5,
    content: [
      { panel: "overview" },
      { layout: "tabs", content: ["context", "agents", "traces", "logs"] }
    ]
  }
}
```

## 4. Resolved Questions

| Question | Decision |
|----------|----------|
| Config format? | Plain object tree — no JSX, no function wrapper |
| Layout discriminator? | Presence of `layout` key (layout node) or `panel` key (panel node) |
| Layout props location? | Flat on the node alongside `layout` and `content` |
| String shorthand? | Strings in `content` are sugar for `{ panel: string }` |
| Config file extension? | `.ts` only — `.tsx` candidates removed from loader |
| Per-layout prop validation? | Belongs in TUI's `validateLayout`, not SDK types |
