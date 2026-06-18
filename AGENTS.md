# AGENTS.md

Agent orchestrator CLI with a TUI dashboard ("Eagle eyes on your agents"). Early-stage; all packages at `0.1.0`.

## Package manager

**Bun** — `bun.lock` is in `.gitignore` and not committed. Use `bun` for all installs and scripts.

## Commands

| Purpose | Command |
|---|---|
| Run all tests | `bun test` (from root) |
| Run the CLI | `bun run adler` or `bun run packages/cli/src/index.ts` |
| Start daemon manually | `bun src/index.ts` (from `packages/daemon`) |

There is **no build step** for development. Bun executes TypeScript source directly.

## Lint & typecheck

- `bun run lint` — Biome (`biome.json`): tabs, double quotes, recommended rules. Per-package: `biome check --fix .`
- `bun run typecheck` — `tsgo` (`@typescript/native-preview`). Per-package: `tsgo --noEmit`
- Both root scripts delegate to all workspace packages via `--filter='*'`.

`adler` with no arguments opens the TUI — that is intentional.

## Monorepo structure

Workspace: `packages/*` and `packages/plugins/*` (plugins dir does not yet exist — reserved).

| Package | Purpose |
|---|---|
| `packages/sdk` (`@adler/sdk`) | Core types, SQLite storage, shared constants/path helpers. No workspace deps — foundation everything depends on. |
| `packages/daemon` (`adlerd`) | Background daemon; Unix socket server at `~/.local/share/adler/adler.sock`; manages agent processes. |
| `packages/tui` (`@adler/tui`) | TUI dashboard built with OpenTUI + React 19. See the `opentui` skill for this framework. |
| `packages/cli` (`adler-cli`) | The `adler` binary. Auto-starts daemon if needed. |

`@adler/sdk` path alias in root `tsconfig.json` resolves to the TypeScript source (not a built artifact) — works because Bun handles it natively.

## Runtime & architecture

- Daemon communicates over a Unix socket; protocol is newline-delimited JSON `{ type, id, payload }`.
- SQLite DB at `~/.local/share/adler/adler.db` (`bun:sqlite`). All runtime state under `~/.local/share/adler/`.
- Session resolution order: `--session` flag → `ADLER_SESSION` env var → `.adler/.session` file.
- Agent config lives in `.adler/adler.ts` (project-level) or `~/.config/adler/adler.ts` (global).
- `__daemon__` is a sentinel session ID filtered out of `session.list` — do not use it.

## Testing quirks

- Test runner: `bun:test` (not Jest/Vitest).
- Daemon tests bind to the real socket path (`~/.local/share/adler/adler.sock`). Running tests while a live daemon is using the socket can cause conflicts; tests clean up with `unlinkSync` before/after.
- No mocking framework — tests use real implementations with in-memory SQLite (`:memory:`).
- end2end TUI tests using the `agent-tui` tool (check skill for further info)

## Workflow conventions

- Git worktrees are the standard isolation strategy; stored at `.worktrees/<branch-name>` (gitignored). See the `using-git-worktrees` skill.
- For parallel subagents: spawn all → wait all → read all. Never `wait` before all agents have been `run`. See the `using-adler-subagents` skill.
- Always pass `--name` to `adler agent run` — unnamed agents get auto-generated IDs that make `wait`/`read` harder to use.
- `adler new` is required before `adler agent run` — an active session must exist first.


