# AGENTS.md

Agent orchestrator CLI with a TUI dashboard ("Eagle eyes on your agents"). Early-stage; all packages at `0.1.0`.

## Package manager

**Bun** — `bun.lock` is in `.gitignore` and not committed. Use `bun` for all installs and scripts.

## Running adlr-cli

- Run from root with `bun run adlr`
- `adlr` with no arguments opens the TUI — that is intentional.

## Tests, Lint & typecheck

- `bun test` - all packages and tests use buns builtin test runner
- `bun lint` — Biome (`biome.json`)
- `bun typecheck` — `tsgo` (`@typescript/native-preview`)
- Both root scripts delegate to all workspace packages via `--filter='*'`. They also exist per package.

Important: Always run tests, lint and typecheck at the end of a coding task

## Monorepo structure

Workspace: `packages/*` and `packages/plugins/*` (plugins dir does not yet exist — reserved).

| Package | Purpose |
|---|---|
| `packages/sdk` (`@adlr/sdk`) | Core types, SQLite storage, shared constants/path helpers. No workspace deps — foundation everything depends on. |
| `packages/daemon` (`adlrd`) | Background daemon; Unix socket server at `~/.local/share/adlr/adlr.sock`; manages agent processes. |
| `packages/tui` (`@adlr/tui`) | TUI dashboard built with OpenTUI + React 19. See the `opentui` skill for this framework. |
| `packages/cli` (`adlr-cli`) | The `adlr` binary. Auto-starts daemon if needed. |

`@adlr/sdk` path alias in root `tsconfig.json` resolves to the TypeScript source (not a built artifact) — works because Bun handles it natively.

## Runtime & architecture

- Daemon communicates over a Unix socket; protocol is newline-delimited JSON `{ type, id, payload }`.
- SQLite DB at `~/.local/share/adlr/adlr.db` (`bun:sqlite`). All runtime state under `~/.local/share/adlr/`.
- Session resolution order: `--session` flag → `ADLR_SESSION` env var → `.adlr/.session` file.
- Agent config lives in `.adlr/adlr.ts` (project-level) or `~/.config/adlr/adlr.ts` (global).
- `__daemon__` is a sentinel session ID filtered out of `session.list` — do not use it.

## Testing quirks

- Test runner: `bun:test` (not Jest/Vitest).
- Daemon tests bind to the real socket path (`~/.local/share/adlr/adlr.sock`). Running tests while a live daemon is using the socket can cause conflicts; tests clean up with `unlinkSync` before/after.
- No mocking framework — tests use real implementations with in-memory SQLite (`:memory:`).
- end2end TUI tests using the `agent-tui` tool (check skill for further info)

## Workflow conventions

- Git worktrees are the standard isolation strategy; stored at `.worktrees/<branch-name>` (gitignored). See the `using-git-worktrees` skill.


