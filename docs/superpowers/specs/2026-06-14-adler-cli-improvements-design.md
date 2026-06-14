# adler CLI Improvements — Commander.js Refactor

## Date
2026-06-14

## Status
Approved

## Context

The adler CLI (`packages/cli`) is currently a hand-rolled switch-based router in `src/index.ts` with a custom flag parser (`parse-flags.ts`). It has no help system, minimal error handling, and inconsistent command interfaces. The goal is to improve the CLI user experience by providing better help, automatic error handling, and a cleaner command structure while keeping dependencies minimal.

## Goals

1. **Better Help & Usage** — Provide `--help` / `-h` for every command and subcommand. Show automatic help when running a subcommand group without a verb (e.g., `adler agent`). List available commands when an unknown command is provided.
2. **Improved Error Handling** — Validate flags, reject unknown options, provide meaningful error messages, and avoid scattered `process.exit(1)` calls.
3. **Global Flags** — Support `--session` (or `-s`) globally across all commands.
4. **Minimal Dependencies** — Use Commander.js as the only new dependency.

## Non-Goals

- Implementing missing commands (`run`, `assistant`) — out of scope for this refactor.
- Adding colors or rich formatting — keep output plain unless requested later.
- Changing SDK or TUI behavior — this is strictly a CLI refactor.

## Architecture

### Entry Point

A new `src/cli.ts` file creates a `Command` program using Commander.js. It defines all top-level commands and subcommands, attaches global options, and configures error handling.

```ts
const program = new Command()
  .name("adler")
  .description("adler - Eagle eyes on your agents")
  .version("0.1.0")
  .option("-s, --session <id>", "session ID override")
```

### Command Structure

Commands are organized as nested `Command` objects:

- `adler` (no args) → launches TUI
- `adler new [--goal <goal>]` → create session
- `adler init` → init project
- `adler session list` → list sessions
- `adler daemon stop` → stop daemon
- `adler agent <subcommand>` → agent subcommands
  - `adler agent run --agent <type> [--name <name>] <prompt>`
  - `adler agent wait --name <name>`
  - `adler agent status --name <name>`
  - `adler agent list`
  - `adler agent read --name <name>`
- `adler context <subcommand>` → context subcommands
  - `adler context add --type <type> [--label <label>] [--description <desc>] <value>`
  - `adler context list`
  - `adler context get [--type <type>] [--label <label>]`

### Global Flags

`-s, --session <id>` is registered on the top-level program and available to all commands. Each command handler receives the parsed options including the session ID.

### Error Handling

All commands throw a custom `AdlerCliError` instead of calling `process.exit(1)`. A top-level wrapper catches these errors, prints a clean message, and exits with code 1.

Commander.js automatically handles:
- Unknown commands
- Unknown options
- Missing required arguments
- Missing required option values

### File Structure

```
src/
  cli.ts              # Entry point (replaces index.ts)
  error.ts            # AdlerCliError class
  resolve-session.ts  # Updated to accept global --session flag
  parse-flags.ts      # Removed (Commander handles this)
  auto-start.ts       # Unchanged
  commands/
    new.ts            # Updated
    init.ts           # Updated
    session.ts        # Updated
    daemon.ts         # Updated
    agent/
      index.ts        # Agent subcommand group
      run.ts          # agent run
      wait.ts         # agent wait
      status.ts       # agent status
      list.ts         # agent list
      read.ts         # agent read
    context/
      index.ts        # Context subcommand group
      add.ts          # context add
      list.ts         # context list
      get.ts          # context get
```

## Migration Plan

1. Add `commander` to `package.json` dependencies.
2. Create `src/cli.ts` with the new entry point.
3. Create `src/error.ts` with the `AdlerCliError` class.
4. Refactor `src/resolve-session.ts` to accept a `session` option from the global flag.
5. Remove `src/parse-flags.ts` (no longer needed).
6. Rewrite each command to export a `Command` object instead of a `run` function.
7. Update `src/index.ts` to delegate to `src/cli.ts` (or replace it).
8. Update tests to use the new structure and test help/error behavior.

## Dependencies

- `commander` (~2.5KB, zero transitive dependencies)

## Testing

- Update `cli.test.ts` to test `resolveSessionId` with the global `--session` flag.
- Add tests for unknown commands, unknown options, and missing required flags.
- Test that `--help` outputs the expected format for each command and subcommand.
- Verify that all existing session resolution tests still pass.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Breaking changes in command behavior | Keep all existing command semantics intact; only change the routing/parsing layer |
| Commander.js adds a dependency | It's minimal, widely used, and removes the need for custom parsing code |
| Tests break | Update tests alongside the implementation; verify all existing tests pass |
