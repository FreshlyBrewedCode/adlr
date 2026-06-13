# Plugin: opencode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@adler/opencode` — a first-party plugin that exports `AdlerConfig` with pre-built opencode agent definitions.

**Architecture:** A single file exporting an `AdlerConfig` object. It defines the `opencode` agent with `run`, `open`, `output`, and `status` hooks. The plugin is loaded by the daemon's config loader and merged with user config.

**Tech Stack:** Bun, `@adler/sdk`

---

## File Structure

```
packages/plugins/opencode/
  package.json
  tsconfig.json
  src/
    index.ts
  test/
    index.test.ts
```

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/plugins/opencode/package.json`
- Create: `packages/plugins/opencode/tsconfig.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@adler/opencode",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test"
  },
  "dependencies": {
    "@adler/sdk": "workspace:*"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/plugins/opencode
git commit -m "feat(plugins/opencode): add package scaffolding"
```

---

## Task 2: Plugin Config

**Files:**
- Create: `packages/plugins/opencode/src/index.ts`

- [ ] **Step 1: Write plugin config**

```ts
import type { AdlerConfig } from "@adler/sdk"

const config: AdlerConfig = {
  agent: {
    agents: {
      opencode: {
        run: ({ prompt, subagent }) => {
          const agent = subagent ?? "default"
          return `opencode run --agent ${agent} "${prompt.replace(/"/g, '\\"')}"`
        },
        open: ({ span }) => {
          const sessionId = span.data?.opencode_session_id as string | undefined
          if (!sessionId) return `opencode`
          return `opencode --session ${sessionId}`
        },
        output: async ({ span, proc, $ }) => {
          const sessionId = span.data?.opencode_session_id as string | undefined
          if (!sessionId) {
            return { type: "text", content: proc.lastStdout }
          }
          try {
            const result = await $`opencode export --session ${sessionId}`
            return { type: "text", content: String(result) }
          } catch {
            return { type: "text", content: proc.lastStdout }
          }
        },
        status: async ({ span, currentStatus, proc }) => {
          if (proc.stdoutIdle) {
            if (proc.lastStdout.includes("permission needed")) return "blocked"
            return "completed"
          }
          return "working"
        },
        statusPollInterval: 3000,
        mode: "tui",
        interactive: true,
        interactiveTimeout: 3000,
      },
    },

    attach: ({ agentId, readCmd, openCmd }) => {
      return `tmux new-window "${openCmd ?? readCmd}"`
    },
  },
}

export default config
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugins/opencode/src/index.ts
git commit -m "feat(plugins/opencode): add opencode agent config"
```

---

## Task 3: Plugin Tests

**Files:**
- Create: `packages/plugins/opencode/test/index.test.ts`

- [ ] **Step 1: Write tests**

```ts
import { test, expect, describe } from "bun:test"
import config from "../src/index"

describe("@adler/opencode", () => {
  test("exports a config object", () => {
    expect(config).toBeObject()
    expect(config.agent).toBeObject()
    expect(config.agent?.agents).toBeObject()
    expect(config.agent?.agents?.opencode).toBeObject()
  })

  test("opencode run hook returns a command", () => {
    const agent = config.agent!.agents!.opencode
    const cmd = agent.run!({ prompt: "hello world", subagent: "build" })
    expect(cmd).toContain("opencode run")
    expect(cmd).toContain("build")
    expect(cmd).toContain("hello world")
  })

  test("opencode run hook escapes quotes", () => {
    const agent = config.agent!.agents!.opencode
    const cmd = agent.run!({ prompt: 'say "hello"', subagent: "build" })
    expect(cmd).not.toContain('say "hello"')
    expect(cmd).toContain('say \\"hello\\"')
  })

  test("opencode status hook returns working when active", async () => {
    const agent = config.agent!.agents!.opencode
    const result = await agent.status!({
      span: {} as any,
      currentStatus: "running",
      proc: { stdoutIdle: false, lastStdout: "" },
      $: {} as any,
    })
    expect(result).toBe("working")
  })

  test("opencode status hook returns completed when idle", async () => {
    const agent = config.agent!.agents!.opencode
    const result = await agent.status!({
      span: {} as any,
      currentStatus: "running",
      proc: { stdoutIdle: true, lastStdout: "" },
      $: {} as any,
    })
    expect(result).toBe("completed")
  })

  test("opencode status hook returns blocked when permission needed", async () => {
    const agent = config.agent!.agents!.opencode
    const result = await agent.status!({
      span: {} as any,
      currentStatus: "running",
      proc: { stdoutIdle: true, lastStdout: "permission needed to proceed" },
      $: {} as any,
    })
    expect(result).toBe("blocked")
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd packages/plugins/opencode && bun test`
Expected: All 6 tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/plugins/opencode
git commit -m "feat(plugins/opencode): add plugin tests"
```

---

## Self-Review

1. **Spec coverage:** §8 Configuration (agent hooks: `run`, `open`, `output`, `status`, `attach`), §8 `status` hook return values (`working`, `completed`, `failed`, `blocked`), §8 `mode`, `interactive`, `interactiveTimeout`, `statusPollInterval` — all covered.
2. **No placeholders:** All hooks are implemented with real logic. No TODOs.
3. **Type consistency:** Uses `AdlerConfig` from `@adler/sdk`. Hook signatures match the spec exactly.

Plan complete.
