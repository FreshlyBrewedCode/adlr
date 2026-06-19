# TUI Usage Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Dependency:** This plan depends on `docs/superpowers/plans/2026-06-19-sdk-refactor.md` completing first. That plan introduces `AgentSpan`, `AgentSpanData`, and `SpanUsage` types in `@adlr/sdk`.

**Goal:** Surface token counts and cost data in the Agents panel (per-card summary line), Traces panel (inline on agent nodes), and Overview panel (cumulative session total).

**Architecture:** A single pure utility module `packages/tui/src/utils/formatUsage.ts` owns all formatting. Three existing panel components are updated to read `AgentSpanData.usage` and render the formatted summary.

**Tech Stack:** React 19, OpenTUI, TypeScript, Bun, bun:test

**Spec reference:** `docs/superpowers/specs/2026-06-19-opencode-observability-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `packages/tui/src/utils/formatUsage.ts` | Pure formatting helpers for tokens and cost |
| Create | `packages/tui/test/utils/formatUsage.test.ts` | Unit tests for all three helpers |
| Edit   | `packages/tui/src/components/Card.tsx` | Add optional `usage` prop; render summary line |
| Edit   | `packages/tui/src/components/panels/AgentsPanel.tsx` | Cast to `AgentSpan`, pass `span.data.usage` to Card |
| Edit   | `packages/tui/src/components/TreeNode.tsx` | Append inline usage summary for agent spans |
| Edit   | `packages/tui/src/components/panels/OverviewPanel.tsx` | Compute and render cumulative session totals |
| Create | `packages/tui/test/utils/agentsPanel.usage.test.ts` | Test Card receives usage / usage absent |
| Create | `packages/tui/test/utils/treeNode.usage.test.ts` | Test shouldShowUsage logic for TreeNode |
| Create | `packages/tui/test/utils/overviewPanel.usage.test.ts` | Test `computeSessionTotals` helper |

---

## SDK types (provided by dependency plan)

The SDK refactor plan adds these types to `@adlr/sdk`. The TUI plan assumes they are present at import time. For reference:

```ts
// @adlr/sdk — added by 2026-06-19-sdk-refactor.md

export interface SpanUsage {
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  cost_usd: number;
}

export interface AgentSpanData {
  agent_type?: string;
  prompt?: string;
  usage?: SpanUsage;
  [key: string]: unknown;
}

export interface AgentSpan extends Span {
  kind: "agent";
  data: AgentSpanData;
}
```

---

## Tasks

### Task 1 — `formatUsage` utility

- [ ] Create `packages/tui/src/utils/formatUsage.ts`
- [ ] Create `packages/tui/test/utils/formatUsage.test.ts`
- [ ] Run `bun test packages/tui/test/utils/formatUsage.test.ts` — all pass
- [ ] Commit: `feat(tui): add formatUsage utility`

#### 1.1 — Create `packages/tui/src/utils/formatUsage.ts`

```ts
import type { SpanUsage } from "@adlr/sdk";

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function formatUsageSummary(usage: SpanUsage): string {
  return `↑ ${formatTokens(usage.tokens.input)}  ↓ ${formatTokens(usage.tokens.output)}  ${formatCost(usage.cost_usd)}`;
}
```

#### 1.2 — Create `packages/tui/test/utils/formatUsage.test.ts`

```ts
import { describe, expect, it } from "bun:test";
import {
  formatCost,
  formatTokens,
  formatUsageSummary,
} from "../../src/utils/formatUsage";
import type { SpanUsage } from "@adlr/sdk";

describe("formatTokens", () => {
  it("returns plain string for 0", () => {
    expect(formatTokens(0)).toBe("0");
  });
  it("returns plain string for 340", () => {
    expect(formatTokens(340)).toBe("340");
  });
  it("returns plain string for 999", () => {
    expect(formatTokens(999)).toBe("999");
  });
  it("formats 1000 as 1.0k", () => {
    expect(formatTokens(1000)).toBe("1.0k");
  });
  it("formats 1200 as 1.2k", () => {
    expect(formatTokens(1200)).toBe("1.2k");
  });
  it("formats 14300 as 14.3k", () => {
    expect(formatTokens(14300)).toBe("14.3k");
  });
});

describe("formatCost", () => {
  it("formats 0 as $0.00", () => {
    expect(formatCost(0)).toBe("$0.00");
  });
  it("formats 0.04 as $0.04", () => {
    expect(formatCost(0.04)).toBe("$0.04");
  });
  it("formats 0.311 as $0.31 (truncates, does not round up in display)", () => {
    expect(formatCost(0.311)).toBe("$0.31");
  });
  it("formats 1.5 as $1.50", () => {
    expect(formatCost(1.5)).toBe("$1.50");
  });
});

describe("formatUsageSummary", () => {
  it("formats a full usage object correctly", () => {
    const usage: SpanUsage = {
      tokens: { input: 1200, output: 340, total: 1540 },
      cost_usd: 0.04,
    };
    expect(formatUsageSummary(usage)).toBe("↑ 1.2k  ↓ 340  $0.04");
  });
});
```

#### 1.3 — Verify

Run:
```sh
bun test packages/tui/test/utils/formatUsage.test.ts
```

All 9 tests must pass before committing.

#### 1.4 — Commit

```sh
git add packages/tui/src/utils/formatUsage.ts packages/tui/test/utils/formatUsage.test.ts
git commit -m "feat(tui): add formatUsage utility"
```

---

### Task 2 — Agents panel: usage summary in Card

- [ ] Edit `packages/tui/src/components/Card.tsx` — add `usage` prop
- [ ] Edit `packages/tui/src/components/panels/AgentsPanel.tsx` — pass `span.data.usage`
- [ ] Create `packages/tui/test/utils/agentsPanel.usage.test.ts`
- [ ] Run `bun typecheck` and `bun test packages/tui/test/utils/agentsPanel.usage.test.ts` — all pass
- [ ] Commit: `feat(tui): show usage summary in Agents panel Card`

#### 2.1 — Edit `packages/tui/src/components/Card.tsx`

Current file (`packages/tui/src/components/Card.tsx`) has 53 lines. Apply this replacement:

**Replace** the entire file with:

```tsx
import type { SpanUsage } from "@adlr/sdk";
import { formatUsageSummary } from "../utils/formatUsage";
import { Theme } from "../theme";

export function Card({
  title,
  description,
  status,
  hint,
  usage,
  isSelected: _isSelected,
  width,
  children,
}: {
  title: string;
  description?: string;
  status: "done" | "failed" | "blocked" | "running" | "pending";
  hint?: string;
  usage?: SpanUsage;
  isSelected?: boolean;
  width?: number;
  children?: React.ReactNode;
}) {
  const statusColor = Theme.status[status];
  return (
    <box
      style={{
        width,
        flexDirection: "column",
        border: ["left"],
        borderColor: statusColor,
        customBorderChars: {
          topLeft: "",
          topRight: "",
          vertical: "┃",
          bottomLeft: "",
          bottomRight: "",
          horizontal: "",
          topT: "",
          bottomT: "",
          leftT: "",
          rightT: "",
          cross: "",
        },
        backgroundColor: Theme.card.base,
        padding: 1,
      }}
    >
      <text fg={statusColor}>
        <b>{title}</b>
      </text>
      {description && <text fg="#666">{description}</text>}
      {usage && (
        <text fg={Theme.muted}>{formatUsageSummary(usage)}</text>
      )}
      {children}
      {hint && <text fg="#666"> {hint}</text>}
    </box>
  );
}
```

Key changes:
- Added `import type { SpanUsage } from "@adlr/sdk"`
- Added `import { formatUsageSummary } from "../utils/formatUsage"`
- Added `usage?: SpanUsage` to the props destructure and type annotation
- Added `{usage && <text fg={Theme.muted}>{formatUsageSummary(usage)}</text>}` between `description` and `children`

#### 2.2 — Edit `packages/tui/src/components/panels/AgentsPanel.tsx`

Current file (`packages/tui/src/components/panels/AgentsPanel.tsx`) has 70 lines. Apply this replacement:

**Replace** the entire file with:

```tsx
import type { AgentSpan, Span } from "@adlr/sdk";
import { useBindings } from "@opentui/keymap/react";
import { useState } from "react";
import type { PanelProps } from "../../core/types";
import { Card } from "../Card";
import { SelectList } from "../SelectList";

export function AgentsPanel({ state, width, height }: PanelProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const agents = state.spans.filter(
    (s): s is AgentSpan => s.kind === "agent",
  );

  useBindings(
    () => ({
      commands: [
        {
          name: "agents:up",
          run() {
            setSelectedIndex((i) => Math.max(0, i - 1));
          },
        },
        {
          name: "agents:down",
          run() {
            setSelectedIndex((i) =>
              Math.max(0, Math.min(agents.length - 1, i + 1)),
            );
          },
        },
        {
          name: "agents:select",
          run() {
            const agent = agents[selectedIndex];
            if (agent) {
              // TODO: attach or read output
            }
          },
        },
      ],
      bindings: [
        { key: "up", cmd: "agents:up" },
        { key: "down", cmd: "agents:down" },
        { key: "return", cmd: "agents:select" },
      ],
    }),
    [agents.length, selectedIndex],
  );

  return (
    <box style={{ flexDirection: "column", width, height }}>
      <SelectList<AgentSpan>
        items={agents}
        selectedIndex={selectedIndex}
        renderItem={(span, _i, isSelected) => (
          <Card
            title={String(span.data?.agent_type ?? span.name)}
            description={String(span.data?.prompt ?? "").slice(0, 40)}
            status={span.status}
            usage={span.data?.usage}
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
    </box>
  );
}
```

Key changes:
- Import changed from `import type { Span }` to `import type { AgentSpan, Span }` (the `Span` import can be removed if unused; keep `AgentSpan`)
- Filter uses a type predicate `(s): s is AgentSpan => s.kind === "agent"` so `agents` is `AgentSpan[]`
- `SelectList<Span>` → `SelectList<AgentSpan>`
- Card receives `usage={span.data?.usage}` (typed as `SpanUsage | undefined` via `AgentSpanData`)

Note: Remove the now-unused `Span` import if TypeScript flags it; import line becomes:
```ts
import type { AgentSpan } from "@adlr/sdk";
```

#### 2.3 — Create `packages/tui/test/utils/agentsPanel.usage.test.ts`

This test file exercises the logic in isolation — it does not render the React tree. It verifies that:
1. When an `AgentSpan` has `data.usage`, `formatUsageSummary` produces the correct string.
2. When an `AgentSpan` has no `data.usage`, `data.usage` is `undefined`.

```ts
import { describe, expect, it } from "bun:test";
import type { AgentSpan } from "@adlr/sdk";
import { formatUsageSummary } from "../../src/utils/formatUsage";

function makeAgentSpan(overrides?: Partial<AgentSpan["data"]>): AgentSpan {
  return {
    id: "span-1",
    session_id: "sess-1",
    parent_id: null,
    kind: "agent",
    name: "opencode",
    status: "done",
    started_at: 1000,
    finished_at: 2000,
    data: {
      agent_type: "opencode",
      prompt: "write tests",
      ...overrides,
    },
  };
}

describe("AgentsPanel — Card usage prop", () => {
  it("passes correct formatted string when usage is present", () => {
    const span = makeAgentSpan({
      usage: {
        tokens: { input: 1200, output: 340, total: 1540 },
        cost_usd: 0.04,
      },
    });
    expect(span.data.usage).toBeDefined();
    expect(formatUsageSummary(span.data.usage!)).toBe("↑ 1.2k  ↓ 340  $0.04");
  });

  it("data.usage is undefined when not provided", () => {
    const span = makeAgentSpan();
    expect(span.data.usage).toBeUndefined();
  });
});
```

#### 2.4 — Verify

```sh
bun typecheck --filter @adlr/tui
bun test packages/tui/test/utils/agentsPanel.usage.test.ts
```

Both must pass cleanly.

#### 2.5 — Commit

```sh
git add packages/tui/src/components/Card.tsx packages/tui/src/components/panels/AgentsPanel.tsx packages/tui/test/utils/agentsPanel.usage.test.ts
git commit -m "feat(tui): show usage summary in Agents panel Card"
```

---

### Task 3 — Traces panel: inline usage on agent nodes

- [ ] Edit `packages/tui/src/components/TreeNode.tsx` — append usage when `span.kind === "agent"` and `usage` is present
- [ ] Create `packages/tui/test/utils/treeNode.usage.test.ts`
- [ ] Run `bun typecheck` and `bun test packages/tui/test/utils/treeNode.usage.test.ts` — all pass
- [ ] Commit: `feat(tui): append inline usage summary to agent nodes in Traces panel`

#### 3.1 — Edit `packages/tui/src/components/TreeNode.tsx`

Current file (`packages/tui/src/components/TreeNode.tsx`) has 26 lines. Replace it with:

```tsx
import type { AgentSpan, Span } from "@adlr/sdk";
import { formatUsageSummary } from "../utils/formatUsage";
import { Theme } from "../theme";

export function TreeNode({
  span,
  depth,
  isSelected,
}: {
  span: Span;
  depth: number;
  isSelected: boolean;
}) {
  const statusColor =
    Theme.status[span.status as keyof typeof Theme.status] ?? Theme.muted;
  const indicator = span.kind === "agent" ? "●" : "○";

  const agentUsage =
    span.kind === "agent"
      ? (span as AgentSpan).data?.usage
      : undefined;

  return (
    <box style={{ backgroundColor: isSelected ? "gray" : undefined }}>
      <text>
        {"  ".repeat(depth)}
        <span fg={statusColor}>{indicator} </span>
        {span.name}
        <span fg="#666"> {span.status}</span>
        {agentUsage && (
          <span fg={Theme.muted}>{"  "}{formatUsageSummary(agentUsage)}</span>
        )}
      </text>
    </box>
  );
}
```

Key changes:
- Added `import type { AgentSpan, Span } from "@adlr/sdk"` (replaces single `Span` import)
- Added `import { formatUsageSummary } from "../utils/formatUsage"`
- Derived `agentUsage` by narrowing: only read `data.usage` when `span.kind === "agent"`, casting to `AgentSpan`
- Appended `{agentUsage && <span fg={Theme.muted}>{"  "}{formatUsageSummary(agentUsage)}</span>}` after status text

#### 3.2 — Create `packages/tui/test/utils/treeNode.usage.test.ts`

This test file validates the `shouldShowUsage` decision logic (the derivation of `agentUsage`) without rendering React. It directly tests the same conditional that `TreeNode` uses.

```ts
import { describe, expect, it } from "bun:test";
import type { AgentSpan, Span } from "@adlr/sdk";

// Mirrors the derivation logic in TreeNode
function deriveAgentUsage(span: Span) {
  return span.kind === "agent"
    ? (span as AgentSpan).data?.usage
    : undefined;
}

function makeSpan(
  kind: Span["kind"],
  data?: Record<string, unknown>,
): Span {
  return {
    id: "span-1",
    session_id: "sess-1",
    parent_id: null,
    kind,
    name: "test",
    status: "done",
    started_at: 1000,
    finished_at: 2000,
    data: data ?? {},
  };
}

describe("TreeNode — usage derivation", () => {
  it("agent with usage → agentUsage is defined (shouldShowUsage = true)", () => {
    const span = makeSpan("agent", {
      usage: {
        tokens: { input: 500, output: 100, total: 600 },
        cost_usd: 0.01,
      },
    });
    const result = deriveAgentUsage(span);
    expect(result).toBeDefined();
    expect(result?.cost_usd).toBe(0.01);
  });

  it("agent without usage → agentUsage is undefined (shouldShowUsage = false)", () => {
    const span = makeSpan("agent", { agent_type: "opencode" });
    const result = deriveAgentUsage(span);
    expect(result).toBeUndefined();
  });

  it("non-agent span with data → agentUsage is undefined regardless", () => {
    const span = makeSpan("step", {
      usage: { tokens: { input: 100, output: 50, total: 150 }, cost_usd: 0.02 },
    });
    const result = deriveAgentUsage(span);
    expect(result).toBeUndefined();
  });
});
```

#### 3.3 — Verify

```sh
bun typecheck --filter @adlr/tui
bun test packages/tui/test/utils/treeNode.usage.test.ts
```

#### 3.4 — Commit

```sh
git add packages/tui/src/components/TreeNode.tsx packages/tui/test/utils/treeNode.usage.test.ts
git commit -m "feat(tui): append inline usage summary to agent nodes in Traces panel"
```

---

### Task 4 — Overview panel: cumulative total

- [ ] Edit `packages/tui/src/components/panels/OverviewPanel.tsx` — extract `computeSessionTotals`, render when `hasUsage`
- [ ] Create `packages/tui/test/utils/overviewPanel.usage.test.ts`
- [ ] Run `bun typecheck` and `bun test packages/tui/test/utils/overviewPanel.usage.test.ts` — all pass
- [ ] Commit: `feat(tui): show cumulative usage total in Overview panel`

#### 4.1 — Edit `packages/tui/src/components/panels/OverviewPanel.tsx`

Current file (`packages/tui/src/components/panels/OverviewPanel.tsx`) has 50 lines. Replace it with:

```tsx
import type { AgentSpan, Span } from "@adlr/sdk";
import { formatCost, formatTokens } from "../../utils/formatUsage";
import type { PanelProps } from "../../core/types";
import { Theme } from "../../theme";
import { StatusBadge } from "../StatusBadge";

export interface SessionTotals {
  hasUsage: boolean;
  totalInput: number;
  totalOutput: number;
  totalCost: number;
}

export function computeSessionTotals(spans: Span[]): SessionTotals {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let hasUsage = false;

  for (const span of spans) {
    if (span.kind !== "agent") continue;
    const usage = (span as AgentSpan).data?.usage;
    if (!usage) continue;
    hasUsage = true;
    totalInput += usage.tokens.input;
    totalOutput += usage.tokens.output;
    totalCost += usage.cost_usd;
  }

  return { hasUsage, totalInput, totalOutput, totalCost };
}

export function OverviewPanel({ state, width, height }: PanelProps) {
  const recentAgents = state.spans
    .filter((s) => s.kind === "agent")
    .sort((a, b) => b.started_at - a.started_at)
    .slice(0, 5);

  const totals = computeSessionTotals(state.spans);

  return (
    <box style={{ flexDirection: "row", width, height }}>
      <box style={{ flexDirection: "column", width: "50%" }}>
        <text>
          <b>Session</b>
        </text>
        <text>Status: {state.session?.status}</text>
        <text>Working dir: {state.session?.working_dir}</text>
        {totals.hasUsage && (
          <text fg={Theme.muted}>
            Total:{"  "}↑ {formatTokens(totals.totalInput)}{"  "}↓{" "}
            {formatTokens(totals.totalOutput)}{"  "}
            {formatCost(totals.totalCost)}
          </text>
        )}
        <box style={{ marginTop: 1 }}>
          <text>
            <b>Recent Agents</b>
          </text>
        </box>
        {recentAgents.map((a) => (
          <box key={a.id}>
            <StatusBadge status={a.status} />
            <text> {a.name}</text>
          </box>
        ))}
      </box>
      <box style={{ flexDirection: "column", width: "50%" }}>
        <text>
          <b>Context</b>
        </text>
        {state.context.map((item) => (
          <box key={item.id}>
            <text
              fg={
                Theme.type[item.type as keyof typeof Theme.type] ?? Theme.muted
              }
            >
              {item.type}
            </text>
            <text> {item.label ?? "—"}</text>
          </box>
        ))}
      </box>
    </box>
  );
}
```

Key changes:
- Added `import type { AgentSpan, Span } from "@adlr/sdk"`
- Added `import { formatCost, formatTokens } from "../../utils/formatUsage"`
- Extracted exported `computeSessionTotals(spans: Span[]): SessionTotals` — pure function, testable in isolation
- Added `const totals = computeSessionTotals(state.spans)` in component body
- Rendered `Total: …` line inside Session column, only when `totals.hasUsage === true`
- Placed totals line between `Working dir` and `Recent Agents` section

#### 4.2 — Create `packages/tui/test/utils/overviewPanel.usage.test.ts`

```ts
import { describe, expect, it } from "bun:test";
import type { Span } from "@adlr/sdk";
import {
  computeSessionTotals,
  type SessionTotals,
} from "../../src/components/panels/OverviewPanel";
import { formatCost, formatTokens } from "../../src/utils/formatUsage";

function makeSpan(
  kind: Span["kind"],
  data?: Record<string, unknown>,
): Span {
  return {
    id: `span-${Math.random()}`,
    session_id: "sess-1",
    parent_id: null,
    kind,
    name: "test",
    status: "done",
    started_at: 1000,
    finished_at: 2000,
    data: data ?? {},
  };
}

describe("computeSessionTotals", () => {
  it("returns hasUsage=false when no spans have usage", () => {
    const spans: Span[] = [
      makeSpan("agent", { agent_type: "opencode" }),
      makeSpan("step"),
    ];
    const result = computeSessionTotals(spans);
    expect(result.hasUsage).toBe(false);
    expect(result.totalInput).toBe(0);
    expect(result.totalOutput).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it("sums tokens and cost across two agent spans with usage", () => {
    const spans: Span[] = [
      makeSpan("agent", {
        usage: { tokens: { input: 1200, output: 340, total: 1540 }, cost_usd: 0.04 },
      }),
      makeSpan("agent", {
        usage: { tokens: { input: 13100, output: 1760, total: 14860 }, cost_usd: 0.27 },
      }),
    ];
    const result = computeSessionTotals(spans);
    expect(result.hasUsage).toBe(true);
    expect(result.totalInput).toBe(14300);
    expect(result.totalOutput).toBe(2100);
    expect(result.totalCost).toBeCloseTo(0.31, 5);
  });

  it("skips non-agent spans and agent spans without usage", () => {
    const spans: Span[] = [
      makeSpan("agent", {
        usage: { tokens: { input: 14300, output: 2100, total: 16400 }, cost_usd: 0.31 },
      }),
      makeSpan("step", {
        usage: { tokens: { input: 999, output: 999, total: 1998 }, cost_usd: 99 },
      }),
      makeSpan("agent", { agent_type: "opencode" }), // no usage
    ];
    const result = computeSessionTotals(spans);
    expect(result.hasUsage).toBe(true);
    expect(result.totalInput).toBe(14300);
    expect(result.totalOutput).toBe(2100);
    expect(result.totalCost).toBeCloseTo(0.31, 5);
  });

  it("formats totals as expected summary string", () => {
    const spans: Span[] = [
      makeSpan("agent", {
        usage: { tokens: { input: 14300, output: 2100, total: 16400 }, cost_usd: 0.31 },
      }),
    ];
    const { hasUsage, totalInput, totalOutput, totalCost } =
      computeSessionTotals(spans);
    expect(hasUsage).toBe(true);
    const summary = `Total:  ↑ ${formatTokens(totalInput)}  ↓ ${formatTokens(totalOutput)}  ${formatCost(totalCost)}`;
    expect(summary).toBe("Total:  ↑ 14.3k  ↓ 2.1k  $0.31");
  });
});
```

#### 4.3 — Verify

```sh
bun typecheck --filter @adlr/tui
bun test packages/tui/test/utils/overviewPanel.usage.test.ts
```

#### 4.4 — Commit

```sh
git add packages/tui/src/components/panels/OverviewPanel.tsx packages/tui/test/utils/overviewPanel.usage.test.ts
git commit -m "feat(tui): show cumulative usage total in Overview panel"
```

---

### Task 5 — Final verification

- [ ] `bun test` (full workspace) — all pass
- [ ] `bun lint` — no errors
- [ ] `bun typecheck` — no errors

```sh
bun test
bun lint
bun typecheck
```

All three commands must exit with code 0 before this plan is considered complete.

---

## Summary

| Task | Files changed | Tests added |
|------|--------------|-------------|
| 1: `formatUsage` utility | `src/utils/formatUsage.ts` (new) | `test/utils/formatUsage.test.ts` (9 cases) |
| 2: Agents panel Card | `src/components/Card.tsx`, `panels/AgentsPanel.tsx` | `test/utils/agentsPanel.usage.test.ts` (2 cases) |
| 3: Traces panel TreeNode | `src/components/TreeNode.tsx` | `test/utils/treeNode.usage.test.ts` (3 cases) |
| 4: Overview panel totals | `panels/OverviewPanel.tsx` | `test/utils/overviewPanel.usage.test.ts` (4 cases) |
| 5: Final verification | — | — |
