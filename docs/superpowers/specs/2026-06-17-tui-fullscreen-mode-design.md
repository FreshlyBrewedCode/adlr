# TUI Fullscreen Mode — Design

**Date:** 2026-06-17

## Summary

Implement proper fullscreen mode for the TUI by switching to the terminal's alternate screen buffer on launch and restoring the main buffer on exit. This gives the TUI a clean, vim-like experience where the original terminal contents are fully restored when the user quits.

## Approach

Minimal escape codes in `runTui()` (Option A). All changes are confined to a single file: `packages/tui/src/index.ts`.

## Changes

**File:** `packages/tui/src/index.ts`

Three additions to `runTui()`:

1. Write `\x1b[?1049h` to `process.stdout` before `render()` — enters the alternate screen buffer.
2. Register `process.on('exit', ...)` to write `\x1b[?1049l` — restores the main buffer unconditionally on process exit.
3. Register `process.on('SIGINT', ...)` and `process.on('SIGTERM', ...)` to call `process.exit(0)` — ensures the `exit` event fires on graceful signal kills.

## Order of Operations

```
write \x1b[?1049h
  → render(<App />)
    → await waitUntilExit()   ← blocks until 'q' / Ctrl-C
  → process exits
    → exit handler writes \x1b[?1049l
      → main buffer restored
```

## What Does Not Change

- No new dependencies.
- No changes to `<App>` or any component.
- No changes to `packages/cli`.
- Ink's own raw mode and cursor handling are unaffected.

## Edge Cases

- **SIGKILL:** Untrappable — accepted limitation.
- **Ink errors:** `process.on('exit')` fires regardless, so cleanup still runs.
- **Multiple `runTui()` calls:** Not a concern — the CLI calls it exactly once.
