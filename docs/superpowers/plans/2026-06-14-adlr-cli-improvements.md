# adlr CLI Improvements — Commander.js Refactor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the adlr CLI to use Commander.js for routing, help, and error handling while adding global `--session` flag support.

**Architecture:** Replace the hand-rolled `switch` router in `src/index.ts` with a Commander.js `Program` object. Each command exports a `Command` instance. A custom `AdlrCliError` class replaces scattered `process.exit(1)` calls. The global `--session` flag is registered on the top-level program and passed to all command handlers.

**Tech Stack:** TypeScript, Bun, Commander.js, @adlr/sdk, @adlr/tui

---

## File Structure

| File | Status | Responsibility |
|------|--------|-------------|
| `src/error.ts` | Create | `AdlrCliError` class for consistent CLI errors |
| `src/resolve-session.ts` | Modify | Accept `session` option from global flag |
| `src/cli.ts` | Create | Commander.js entry point with all commands wired up |
| `src/index.ts` | Modify | Delegate to `cli.ts` |
| `src/parse-flags.ts` | Delete | No longer needed (Commander parses flags) |
| `src/commands/init.ts` | Modify | Export `Command` instead of `run` function |
| `src/commands/new.ts` | Modify | Export `Command` instead of `run` function |
| `src/commands/session.ts` | Modify | Export `Command` instead of `run` function |
| `src/commands/daemon.ts` | Modify | Export `Command` instead of `run` function |
| `src/commands/agent/index.ts` | Create | Agent subcommand group |
| `src/commands/agent/run.ts` | Create | `agent run` subcommand |
| `src/commands/agent/wait.ts` | Create | `agent wait` subcommand |
| `src/commands/agent/status.ts` | Create | `agent status` subcommand |
| `src/commands/agent/list.ts` | Create | `agent list` subcommand |
| `src/commands/agent/read.ts` | Create | `agent read` subcommand |
| `src/commands/context/index.ts` | Create | Context subcommand group |
| `src/commands/context/add.ts` | Create | `context add` subcommand |
| `src/commands/context/list.ts` | Create | `context list` subcommand |
| `src/commands/context/get.ts` | Create | `context get` subcommand |
| `package.json` | Modify | Add `commander` dependency |
| `test/cli.test.ts` | Modify | Update existing tests, add new ones |

---

### Task 1: Add Commander.js Dependency

**Files:**
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Add commander to dependencies**

```json
{
  "dependencies": {
    "@adlr/sdk": "workspace:*",
    "@adlr/tui": "workspace:*",
    "adlrd": "workspace:*",
    "commander": "^13.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /mnt/shares/git/adlr && bun install`
Expected: `commander` is installed successfully

- [ ] **Step 3: Commit**

```bash
git add packages/cli/package.json bun.lock
git commit -m "deps(cli): add commander"
```

---

### Task 2: Create AdlrCliError Class

**Files:**
- Create: `packages/cli/src/error.ts`

- [ ] **Step 1: Write the error class**

```typescript
export class AdlrCliError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdlrCliError"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/error.ts
git commit -m "feat(cli): add AdlrCliError class"
```

---

### Task 3: Update resolve-session.ts

**Files:**
- Modify: `packages/cli/src/resolve-session.ts`

- [ ] **Step 1: Read current file**

Read: `packages/cli/src/resolve-session.ts`

- [ ] **Step 2: Update to accept explicit session option**

```typescript
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

export function resolveSessionId(options: { session?: string }): string | undefined {
  if (options.session) {
    return options.session
  }

  if (process.env.ADLR_SESSION) {
    return process.env.ADLR_SESSION
  }

  const sessionFile = join(process.cwd(), ".adlr", ".session")
  if (existsSync(sessionFile)) {
    return readFileSync(sessionFile, "utf-8").trim()
  }

  return undefined
}
```

- [ ] **Step 3: Run existing tests**

Run: `cd /mnt/shares/git/adlr/packages/cli && bun test`
Expected: All 4 existing tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/resolve-session.ts
git commit -m "feat(cli): accept session option in resolveSessionId"
```

---

### Task 4: Create Agent Subcommand Files

**Files:**
- Create: `packages/cli/src/commands/agent/run.ts`
- Create: `packages/cli/src/commands/agent/wait.ts`
- Create: `packages/cli/src/commands/agent/status.ts`
- Create: `packages/cli/src/commands/agent/list.ts`
- Create: `packages/cli/src/commands/agent/read.ts`
- Create: `packages/cli/src/commands/agent/index.ts`

- [ ] **Step 1: Create agent/run.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../../auto-start"
import { resolveSessionId } from "../../resolve-session"
import { AdlrCliError } from "../../error"

export const agentRunCmd = new Command("run")
  .description("Run an agent")
  .requiredOption("--agent <type>", "Agent type")
  .option("--name <name>", "Agent name")
  .argument("<prompt>", "Prompt to send to the agent")
  .action(async (prompt: string, options: { agent: string; name?: string }) => {
    await ensureDaemon()
    const client = createClient()
    const sessionId = resolveSessionId({ session: agentRunCmd.optsWithGlobals().session })
    if (!sessionId) {
      throw new AdlrCliError("No active session. Run `adlr new` first.")
    }

    try {
      const span = await client.agent.run({
        sessionId,
        agentType: options.agent,
        prompt,
        name: options.name ?? `agent-${Date.now()}`,
        parentSpanId: client.env().spanId,
      })
      console.log(span.id)
    } finally {
      client.close()
    }
  })
```

- [ ] **Step 2: Create agent/wait.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../../auto-start"
import { AdlrCliError } from "../../error"

export const agentWaitCmd = new Command("wait")
  .description("Wait for an agent to finish")
  .requiredOption("--name <name>", "Agent name")
  .action(async (options: { name: string }) => {
    await ensureDaemon()
    const client = createClient()
    try {
      const span = await client.agent.wait({ name: options.name })
      console.log(span.status)
    } finally {
      client.close()
    }
  })
```

- [ ] **Step 3: Create agent/status.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../../auto-start"
import { AdlrCliError } from "../../error"

export const agentStatusCmd = new Command("status")
  .description("Get agent status")
  .requiredOption("--name <name>", "Agent name")
  .action(async (options: { name: string }) => {
    await ensureDaemon()
    const client = createClient()
    try {
      const status = await client.agent.status({ name: options.name })
      console.log(status)
    } finally {
      client.close()
    }
  })
```

- [ ] **Step 4: Create agent/list.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../../auto-start"

export const agentListCmd = new Command("list")
  .description("List all agents")
  .action(async () => {
    await ensureDaemon()
    const client = createClient()
    try {
      const spans = await client.agent.list()
      for (const span of spans) {
        console.log(`${span.id} ${span.name} ${span.status}`)
      }
    } finally {
      client.close()
    }
  })
```

- [ ] **Step 5: Create agent/read.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../../auto-start"
import { AdlrCliError } from "../../error"

export const agentReadCmd = new Command("read")
  .description("Read agent output")
  .requiredOption("--name <name>", "Agent name")
  .action(async (options: { name: string }) => {
    await ensureDaemon()
    const client = createClient()
    try {
      const span = await client.agent.wait({ name: options.name })
      if (span.data?.output) {
        const output = span.data.output as { type: string; content?: string; path?: string }
        if (output.type === "text" && output.content) {
          console.log(output.content)
        } else if (output.type === "file" && output.path) {
          console.log(`File output: ${output.path}`)
        } else {
          console.log("Unknown output type")
        }
      } else {
        await client.agent.attach(options.name)
      }
    } finally {
      client.close()
    }
  })
```

- [ ] **Step 6: Create agent/index.ts**

```typescript
import { Command } from "commander"
import { agentRunCmd } from "./run"
import { agentWaitCmd } from "./wait"
import { agentStatusCmd } from "./status"
import { agentListCmd } from "./list"
import { agentReadCmd } from "./read"

export const agentCmd = new Command("agent")
  .description("Agent management commands")
  .addCommand(agentRunCmd)
  .addCommand(agentWaitCmd)
  .addCommand(agentStatusCmd)
  .addCommand(agentListCmd)
  .addCommand(agentReadCmd)
```

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/agent/
git commit -m "feat(cli): add agent subcommands with commander"
```

---

### Task 5: Create Context Subcommand Files

**Files:**
- Create: `packages/cli/src/commands/context/add.ts`
- Create: `packages/cli/src/commands/context/list.ts`
- Create: `packages/cli/src/commands/context/get.ts`
- Create: `packages/cli/src/commands/context/index.ts`

- [ ] **Step 1: Create context/add.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../../auto-start"
import { resolveSessionId } from "../../resolve-session"
import { AdlrCliError } from "../../error"

export const contextAddCmd = new Command("add")
  .description("Add a context item")
  .requiredOption("--type <type>", "Context item type")
  .option("--label <label>", "Label")
  .option("--description <description>", "Description")
  .argument("<value>", "Value to add")
  .action(async (value: string, options: { type: string; label?: string; description?: string }) => {
    await ensureDaemon()
    const client = createClient()
    const sessionId = resolveSessionId({ session: contextAddCmd.optsWithGlobals().session })
    if (!sessionId) {
      throw new AdlrCliError("No active session. Run `adlr new` first.")
    }

    let parsedValue: Record<string, unknown>
    try {
      parsedValue = JSON.parse(value)
    } catch {
      parsedValue = { text: value }
    }

    try {
      const item = await client.context.add({
        session_id: sessionId,
        type: options.type as import("@adlr/sdk").ContextItemType,
        label: options.label ?? null,
        description: options.description ?? null,
        value: parsedValue,
      })
      console.log(`Added context item ${item.id}`)
    } finally {
      client.close()
    }
  })
```

- [ ] **Step 2: Create context/list.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../../auto-start"

export const contextListCmd = new Command("list")
  .description("List all context items")
  .action(async () => {
    await ensureDaemon()
    const client = createClient()
    try {
      const items = await client.context.list()
      for (const item of items) {
        console.log(`${item.type} ${item.label ?? ""} ${JSON.stringify(item.value)}`)
      }
    } finally {
      client.close()
    }
  })
```

- [ ] **Step 3: Create context/get.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../../auto-start"

export const contextGetCmd = new Command("get")
  .description("Get context items by filter")
  .option("--type <type>", "Filter by type")
  .option("--label <label>", "Filter by label")
  .action(async (options: { type?: string; label?: string }) => {
    await ensureDaemon()
    const client = createClient()
    try {
      const items = await client.context.list()
      const filtered = items.filter((i) => {
        if (options.type && i.type !== options.type) return false
        if (options.label && i.label !== options.label) return false
        return true
      })
      for (const item of filtered) {
        console.log(JSON.stringify(item.value))
      }
    } finally {
      client.close()
    }
  })
```

- [ ] **Step 4: Create context/index.ts**

```typescript
import { Command } from "commander"
import { contextAddCmd } from "./add"
import { contextListCmd } from "./list"
import { contextGetCmd } from "./get"

export const contextCmd = new Command("context")
  .description("Context management commands")
  .addCommand(contextAddCmd)
  .addCommand(contextListCmd)
  .addCommand(contextGetCmd)
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/context/
git commit -m "feat(cli): add context subcommands with commander"
```

---

### Task 6: Refactor Simple Commands

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/commands/new.ts`
- Modify: `packages/cli/src/commands/session.ts`
- Modify: `packages/cli/src/commands/daemon.ts`

- [ ] **Step 1: Refactor init.ts**

```typescript
import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { Command } from "commander"

const CONFIG_TEMPLATE = `import type { AdlrConfig } from "@adlr/sdk"

const config: AdlrConfig = {
  agent: {
    agents: {
      // Example: echo: ({ prompt }) => \`echo "\${prompt}"\`,
    },
  },
}

export default config
`

export const initCmd = new Command("init")
  .description("Initialize adlr in the current project")
  .action(async () => {
    const dir = join(process.cwd(), ".adlr")
    mkdirSync(dir, { recursive: true })
    const configPath = join(dir, "adlr.ts")
    if (existsSync(configPath)) {
      console.log("adlr.ts already exists")
      return
    }
    writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8")
    console.log(`Created ${configPath}`)
  })
```

- [ ] **Step 2: Refactor new.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { ensureDaemon } from "../auto-start"

export const newCmd = new Command("new")
  .description("Create a new session")
  .option("--goal <goal>", "Initial goal for the session")
  .action(async (options: { goal?: string }) => {
    await ensureDaemon()
    const client = createClient()

    try {
      const session = await client.session.create({
        working_dir: process.cwd(),
      })

      if (options.goal) {
        await client.context.add({
          session_id: session.id,
          type: "goal",
          value: { text: options.goal },
        })
      }

      const dir = join(process.cwd(), ".adlr")
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, ".session"), session.id, "utf-8")

      console.log(`Created session ${session.id}`)
    } finally {
      client.close()
    }
  })
```

- [ ] **Step 3: Refactor session.ts**

```typescript
import { Command } from "commander"
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../auto-start"

export const sessionCmd = new Command("session")
  .description("Session management commands")
  .addCommand(
    new Command("list")
      .description("List all sessions")
      .action(async () => {
        await ensureDaemon()
        const client = createClient()
        try {
          const sessions = await client.session.list()
          for (const s of sessions) {
            console.log(`${s.id} ${s.status} ${s.working_dir}`)
          }
        } finally {
          client.close()
        }
      })
  )
```

- [ ] **Step 4: Refactor daemon.ts**

```typescript
import { Command } from "commander"
import { PID_FILE } from "@adlr/sdk"
import { readFileSync, existsSync } from "node:fs"

export const daemonCmd = new Command("daemon")
  .description("Daemon management commands")
  .addCommand(
    new Command("stop")
      .description("Stop the daemon")
      .action(async () => {
        if (!existsSync(PID_FILE)) {
          console.log("Daemon is not running")
          return
        }
        const raw = readFileSync(PID_FILE, "utf-8").trim()
        const pid = parseInt(raw, 10)
        if (Number.isNaN(pid)) {
          console.error("Corrupted PID file: not a valid number")
          return
        }
        try {
          process.kill(pid, "SIGTERM")
          console.log("Daemon stopped")
        } catch {
          console.error("Failed to stop daemon")
        }
      })
  )
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/init.ts packages/cli/src/commands/new.ts packages/cli/src/commands/session.ts packages/cli/src/commands/daemon.ts
git commit -m "feat(cli): refactor simple commands to use commander"
```

---

### Task 7: Create CLI Entry Point

**Files:**
- Create: `packages/cli/src/cli.ts`

- [ ] **Step 1: Write cli.ts**

```typescript
import { Command } from "commander"
import { initCmd } from "./commands/init"
import { newCmd } from "./commands/new"
import { sessionCmd } from "./commands/session"
import { daemonCmd } from "./commands/daemon"
import { agentCmd } from "./commands/agent"
import { contextCmd } from "./commands/context"
import { AdlrCliError } from "./error"

export function buildCli(): Command {
  const program = new Command()
    .name("adlr")
    .description("adlr - Eagle eyes on your agents")
    .version("0.1.0")
    .option("-s, --session <id>", "Session ID override")
    .configureHelp({
      subcommandTerm: (cmd) => `${cmd.name()} ${cmd.usage() || ""}`.trim(),
    })

  program.addCommand(initCmd)
  program.addCommand(newCmd)
  program.addCommand(sessionCmd)
  program.addCommand(daemonCmd)
  program.addCommand(agentCmd)
  program.addCommand(contextCmd)

  return program
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = buildCli()

  try {
    await program.parseAsync(argv)
  } catch (err) {
    if (err instanceof AdlrCliError) {
      console.error(err.message)
      process.exit(1)
    }
    throw err
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/cli.ts
git commit -m "feat(cli): add commander entry point"
```

---

### Task 8: Update index.ts

**Files:**
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Replace index.ts**

```typescript
#!/usr/bin/env bun
import { runCli } from "./cli"

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    // Launch TUI
    const { ensureDaemon } = await import("./auto-start")
    await ensureDaemon()
    try {
      const { runTui } = await import("@adlr/tui")
      await runTui()
    } catch (err) {
      console.error("TUI failed to start:", err)
      process.exit(1)
    }
    return
  }

  await runCli(process.argv)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): update index.ts to delegate to cli.ts"
```

---

### Task 9: Remove parse-flags.ts

**Files:**
- Delete: `packages/cli/src/parse-flags.ts`

- [ ] **Step 1: Delete the file**

```bash
git rm packages/cli/src/parse-flags.ts
git commit -m "refactor(cli): remove parse-flags.ts (commander handles parsing)"
```

---

### Task 10: Update Tests

**Files:**
- Modify: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Write updated tests**

```typescript
import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { resolveSessionId } from "../src/resolve-session"
import { buildCli } from "../src/cli"
import { AdlrCliError } from "../src/error"
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs"
import { join } from "node:path"

describe("CLI", () => {
  let oldSession: string | undefined

  beforeEach(() => {
    oldSession = process.env.ADLR_SESSION
    delete process.env.ADLR_SESSION
  })

  afterEach(() => {
    if (oldSession !== undefined) {
      process.env.ADLR_SESSION = oldSession
    } else {
      delete process.env.ADLR_SESSION
    }
  })

  test("resolveSessionId returns env var", () => {
    process.env.ADLR_SESSION = "env-sess"
    const id = resolveSessionId({})
    expect(id).toBe("env-sess")
  })

  test("resolveSessionId prefers explicit session argument over env var", () => {
    process.env.ADLR_SESSION = "env-sess"
    const id = resolveSessionId({ session: "flag-sess" })
    expect(id).toBe("flag-sess")
  })

  test("resolveSessionId reads .adlr/.session file", () => {
    const sessionDir = join(process.cwd(), ".adlr")
    const sessionFile = join(sessionDir, ".session")
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(sessionFile, " file-sess \n", "utf-8")
    try {
      const id = resolveSessionId({})
      expect(id).toBe("file-sess")
    } finally {
      unlinkSync(sessionFile)
      rmdirSync(sessionDir)
    }
  })

  test("resolveSessionId returns undefined when nothing set", () => {
    const id = resolveSessionId({})
    expect(id).toBeUndefined()
  })

  test("AdlrCliError has correct name and message", () => {
    const err = new AdlrCliError("test message")
    expect(err.name).toBe("AdlrCliError")
    expect(err.message).toBe("test message")
  })

  test("CLI shows help for unknown command", async () => {
    const cli = buildCli()
    let output = ""
    cli.configureOutput({
      writeErr: (str) => {
        output += str
      },
    })
    try {
      await cli.parseAsync(["node", "adlr", "unknown"])
    } catch {
      // expected
    }
    expect(output).toContain("error: unknown command")
  })

  test("CLI shows help for agent command", async () => {
    const cli = buildCli()
    let output = ""
    cli.configureOutput({
      writeOut: (str) => {
        output += str
      },
    })
    try {
      await cli.parseAsync(["node", "adlr", "agent", "--help"])
    } catch {
      // expected
    }
    expect(output).toContain("Usage:")
    expect(output).toContain("run")
    expect(output).toContain("list")
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd /mnt/shares/git/adlr/packages/cli && bun test`
Expected: All tests pass (including the new ones)

- [ ] **Step 3: Commit**

```bash
git add packages/cli/test/cli.test.ts
git commit -m "test(cli): update tests for commander refactor"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Type check**

Run: `cd /mnt/shares/git/adlr && bun tsc --noEmit -p packages/cli/tsconfig.json`
Expected: No type errors

- [ ] **Step 2: Run full test suite**

Run: `cd /mnt/shares/git/adlr/packages/cli && bun test`
Expected: All tests pass

- [ ] **Step 3: Verify CLI help works**

Run: `cd /mnt/shares/git/adlr && bun packages/cli/src/index.ts --help`
Expected: Shows help with all commands listed

- [ ] **Step 4: Verify subcommand help works**

Run: `cd /mnt/shares/git/adlr && bun packages/cli/src/index.ts agent --help`
Expected: Shows agent subcommands

- [ ] **Step 5: Verify unknown command error**

Run: `cd /mnt/shares/git/adlr && bun packages/cli/src/index.ts foo 2>&1 || true`
Expected: Shows "error: unknown command 'foo'"

- [ ] **Step 6: Commit if all pass**

```bash
git commit --allow-empty -m "chore(cli): verify commander refactor"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Add `--help` / `-h` for every command | Tasks 4-7 (Commander auto-generates help) |
| Auto-help when running subcommand group without verb | Task 7 (Commander default behavior) |
| List available commands for unknown command | Task 7 (Commander default behavior) |
| Validate flags, reject unknown options | Tasks 4-6 (Commander `.requiredOption()`, `.option()`) |
| Provide meaningful error messages | Tasks 2, 7 (AdlrCliError + top-level handler) |
| Global `--session` flag | Tasks 3, 7 (`.option("-s, --session <id>")`) |
| Minimal dependencies | Task 1 (only `commander` added) |

---

## Placeholder Scan

- No "TBD", "TODO", or "implement later" found.
- No vague requirements like "add appropriate error handling".
- All steps contain exact file paths and code.
- No "Similar to Task N" references.

---

## Type Consistency Check

- `resolveSessionId` accepts `{ session?: string }` in Task 3.
- All command handlers use `optsWithGlobals()` to access `--session` in Tasks 4-6.
- `AdlrCliError` is used consistently across all command files.
- `buildCli()` returns `Command` in Task 7.
- `runCli()` accepts `string[]` in Task 7.

All types are consistent.
