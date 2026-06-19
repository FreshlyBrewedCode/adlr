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

## Environment-based configuration

Runtime paths can be overridden via environment variables. This is used by the test harness to keep tests isolated from the user's live daemon.

| Env var | Fallback | Controls |
|---|---|---|
| `ADLR_DIR` | `~/.local/share/adlr` | Base directory for socket, DB, and PID file |
| `ADLR_SOCKET` | `$ADLR_DIR/adlr.sock` | Unix socket path |
| `ADLR_DB` | `$ADLR_DIR/adlr.db` | SQLite database path |
| `ADLR_PID_FILE` | `$ADLR_DIR/adlr.pid` | Daemon PID file path |

The CLI, daemon, SDK client, and spawned agents all read these values through `@adlr/sdk` path getters so a single `ADLR_DIR` override is sufficient for full isolation.

## Testing quirks

- Test runner: `bun:test` (not Jest/Vitest).
- Tests never bind to the default socket path. Daemon server tests create a temp socket per test, and CLI integration tests spawn the real binary inside a temp `HOME`/`ADLR_DIR` so each test gets its own daemon.
- No mocking framework — tests use real implementations with in-memory SQLite (`:memory:`).
- end2end TUI tests using the `agent-tui` tool (check skill for further info)

## Workflow conventions

- Git worktrees are the standard isolation strategy; stored at `.worktrees/<branch-name>` (gitignored). See the `using-git-worktrees` skill.


