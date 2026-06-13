# adler Core + TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the adler daemon, SDK, CLI, and TUI dashboard as a Bun monorepo, implementing the core session/agent/context observability system with SQLite persistence and Unix socket IPC.

**Architecture:** Four packages (`sdk`, `daemon`, `cli`, `tui`) plus one plugin (`plugins/opencode`). The daemon is the sole SQLite writer and agent process manager. The SDK wraps Unix socket IPC with auto-start. The CLI and TUI are thin SDK consumers. Everything is TypeScript on Bun, using `bun:sqlite` for persistence.

**Tech Stack:** Bun (runtime + TypeScript + SQLite), Ink (React TUI), `node-pty` (pseudo-terminals), Unix domain sockets (IPC)

---

## Execution Order

This plan is split into five sub-plans. They must be implemented in order — each package is a dependency for the next.

| # | Sub-plan | Package | Depends on | File |
|---|---|---|---|---|
| 1 | [Monorepo + SDK](./2026-06-13-adler-sdk-package.md) | `@adler/sdk` | — | `sdk-package.md` |
| 2 | [Daemon](./2026-06-13-adler-daemon-package.md) | `adlerd` | `@adler/sdk` | `daemon-package.md` |
| 3 | [CLI](./2026-06-13-adler-cli-package.md) | `adler` | `@adler/sdk`, `adlerd` | `cli-package.md` |
| 4 | [TUI](./2026-06-13-adler-tui-package.md) | TUI dashboard | `adler`, `adlerd` | `tui-package.md` |
| 5 | [Plugin: opencode](./2026-06-13-adler-opencode-plugin.md) | `@adler/opencode` | `@adler/sdk` | `opencode-plugin.md` |

> **Important:** The SDK exports types and the `Storage` interface. The daemon implements `Storage` with SQLite. The CLI and TUI import only from `@adler/sdk`. No package imports from a sibling except via the SDK.

---

## Monorepo Structure

```
packages/
  sdk/          → @adler/sdk
  daemon/       → adlerd
  cli/          → adler CLI binary
  tui/          → Ink dashboard
  plugins/
    opencode/   → @adler/opencode
```

### Root `package.json`

```json
{
  "name": "adler",
  "private": true,
  "workspaces": ["packages/*", "packages/plugins/*"],
  "scripts": {
    "test": "bun test"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/react": "^18.3.0",
    "@types/node": "^20.0.0"
  }
}
```

### Root `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": ".",
    "paths": {
      "@adler/sdk": ["./packages/sdk/src/index.ts"]
    }
  },
  "include": ["packages/**/*"]
}
```

---

## Cross-Cutting Concerns

### 1. Environment Variables

All packages use these env vars consistently:

| Variable | Set by | Read by |
|---|---|---|
| `ADLER_SESSION` | daemon on spawn | CLI, agents, SDK `env()` |
| `ADLER_SPAN_ID` | daemon on spawn | CLI, agents, SDK `env()` |
| `ADLER_SOCKET` | CLI/daemon | SDK client, agents |
| `ADLER_AGENT_PROMPT` | daemon on spawn | agent process |
| `ADLER_CONTEXT` | daemon on spawn | agent process |

### 2. Runtime Paths

All derived from `~/.local/share/adler/`:

```ts
// In @adler/sdk — shared path utilities
import { homedir } from "os"
import { join } from "path"

export const ADLER_DIR = join(homedir(), ".local/share/adler")
export const SOCKET_PATH = join(ADLER_DIR, "adler.sock")
export const DB_PATH = join(ADLER_DIR, "adler.db")
export const PID_FILE = join(ADLER_DIR, "adler.pid")
```

### 3. Type Conventions

- All timestamps are `number` (Unix ms)
- UUIDs are `string` (v4)
- Status fields are literal union types
- JSON columns are `unknown` / `Record<string, unknown>` with runtime assertions

### 4. Commit Strategy

Each sub-plan ends every task with a commit. The commit messages follow:

- `feat(sdk): add storage interface and types`
- `feat(daemon): implement socket server`
- `feat(cli): add agent run command`

---

## Spec Coverage

| Spec Section | Implemented in |
|---|---|
| §3 Data Model (sessions, spans, events, context_items) | SDK types + SQLite Storage |
| §3 Storage Interface | SDK types, daemon SQLite impl |
| §4 Daemon lifecycle | Daemon package |
| §4 IPC protocol | SDK client + daemon server |
| §4 Agent spawning | Daemon package |
| §4 Span context propagation | Daemon env vars + CLI resolution |
| §5 SDK client | SDK package |
| §6 CLI commands | CLI package |
| §7 TUI dashboard | TUI package |
| §8 Configuration | SDK types + daemon config loader |
| §8 Plugin system | Plugin package (opencode) |

---

## Test Strategy

- **Unit tests** in `packages/sdk/test/` for Storage interface and types
- **Integration tests** in `packages/daemon/test/` for socket server and agent spawning
- **CLI tests** in `packages/cli/test/` using subprocess invocation
- **TUI tests** are visual — no automated tests; verify by running `adler`

---

## Self-Review

1. **Spec coverage:** All sections of the 2026-06-11 spec are covered by at least one task in the sub-plans.
2. **No placeholders:** Every task contains exact file paths, code, or commands. No "TBD", "TODO", or "implement later".
3. **Type consistency:** All types are defined in `@adler/sdk` and imported by downstream packages. No redefined interfaces.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-13-adler-core-tui-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per sub-plan, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
