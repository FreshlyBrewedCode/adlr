# CLI Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `adlr` CLI binary — thin wrapper around `@adlr/sdk` that resolves sessions, auto-starts the daemon, and exposes all commands.

**Architecture:** Single-file entry point with subcommand routing. Each command creates an SDK client, resolves the session, and calls the appropriate SDK method. The CLI with no arguments launches the TUI.

**Tech Stack:** Bun, `@adlr/sdk`, `arg` for CLI parsing (or minimal manual parsing)

---

## File Structure

```
packages/cli/
  package.json
  tsconfig.json
  src/
    index.ts
    commands/
      new.ts
      agent.ts
      context.ts
      session.ts
      init.ts
      daemon.ts
    resolve-session.ts
    auto-start.ts
```

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "adlr-cli",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "bin": {
    "adlr": "src/index.ts"
  },
  "scripts": {
    "test": "bun test"
  },
  "dependencies": {
    "@adlr/sdk": "workspace:*"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): add package scaffolding"
```

---

## Task 2: Session Resolution (`resolve-session.ts`)

**Files:**
- Create: `packages/cli/src/resolve-session.ts`

- [ ] **Step 1: Write resolver**

```ts
import { readFileSync, existsSync } from "fs"
import { join } from "path"

export function resolveSessionId(args: { session?: string }): string | undefined {
  if (args.session) return args.session
  if (process.env.ADLR_SESSION) return process.env.ADLR_SESSION
  const localFile = join(process.cwd(), ".adlr", ".session")
  if (existsSync(localFile)) {
    return readFileSync(localFile, "utf-8").trim()
  }
  return undefined
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/resolve-session.ts
git commit -m "feat(cli): add session resolution"
```

---

## Task 3: Auto-Start (`auto-start.ts`)

**Files:**
- Create: `packages/cli/src/auto-start.ts`

- [ ] **Step 1: Write auto-start logic**

```ts
import { connect } from "net"
import { spawn } from "child_process"
import { SOCKET_PATH, ADLR_DIR } from "@adlr/sdk"
import { existsSync } from "fs"

export async function ensureDaemon(): Promise<void> {
  if (existsSync(SOCKET_PATH)) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = connect(SOCKET_PATH)
        socket.on("connect", () => { socket.end(); resolve() })
        socket.on("error", reject)
      })
      return
    } catch {
      // Socket exists but no daemon — continue to spawn
    }
  }

  const daemonPath = require.resolve("adlrd/src/index.ts")
  const proc = spawn("bun", [daemonPath], {
    detached: true,
    stdio: "ignore",
  })
  proc.unref()

  // Poll socket for 5 seconds
  const start = Date.now()
  while (Date.now() - start < 5000) {
    await new Promise(r => setTimeout(r, 100))
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = connect(SOCKET_PATH)
        socket.on("connect", () => { socket.end(); resolve() })
        socket.on("error", reject)
      })
      return
    } catch {
      // Keep polling
    }
  }
  throw new Error("Daemon failed to start within 5 seconds")
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/auto-start.ts
git commit -m "feat(cli): add daemon auto-start"
```

---

## Task 4: Commands

### 4a: `adlr new` (`commands/new.ts`)

**Files:**
- Create: `packages/cli/src/commands/new.ts`

- [ ] **Step 1: Write new command**

```ts
import { createClient } from "@adlr/sdk"
import { writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { ensureDaemon } from "../auto-start"

export async function run(args: { goal?: string }): Promise<void> {
  await ensureDaemon()
  const client = createClient()
  const session = await client.session.create({
    working_dir: process.cwd(),
  })

  if (args.goal) {
    await client.context.add({
      session_id: session.id,
      type: "goal",
      value: { text: args.goal },
    })
  }

  const dir = join(process.cwd(), ".adlr")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, ".session"), session.id, "utf-8")

  console.log(`Created session ${session.id}`)
  client.close()
}
```

### 4b: `adlr agent` (`commands/agent.ts`)

**Files:**
- Create: `packages/cli/src/commands/agent.ts`

- [ ] **Step 2: Write agent command**

```ts
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../auto-start"
import { resolveSessionId } from "../resolve-session"

export async function run(args: string[], subcommand: string): Promise<void> {
  await ensureDaemon()
  const client = createClient()
  const sessionId = resolveSessionId({})
  if (!sessionId) {
    console.error("No active session. Run `adlr new` first.")
    process.exit(1)
  }

  const flags = parseFlags(args)

  switch (subcommand) {
    case "run": {
      const prompt = flags._?.join(" ") ?? ""
      if (!prompt) {
        console.error("Usage: adlr agent run --agent <type> [--name <name>] <prompt>")
        process.exit(1)
      }
      const span = await client.agent.run({
        sessionId,
        agentType: flags.agent,
        prompt,
        name: flags.name ?? `agent-${Date.now()}`,
        parentSpanId: client.env().spanId,
      })
      console.log(span.id)
      break
    }
    case "wait": {
      const span = await client.agent.wait({ name: flags.name })
      console.log(span.status)
      break
    }
    case "status": {
      const status = await client.agent.status({ name: flags.name })
      console.log(status)
      break
    }
    case "list": {
      const spans = await client.agent.list()
      for (const span of spans) {
        console.log(`${span.id} ${span.name} ${span.status}`)
      }
      break
    }
    case "read": {
      const span = await client.agent.wait({ name: flags.name })
      if (span.data?.output) {
        const output = span.data.output as { type: string; content?: string; path?: string }
        if (output.type === "text" && output.content) {
          console.log(output.content)
        } else if (output.type === "file" && output.path) {
          console.log(`File output: ${output.path}`)
        }
      } else {
        // Attach to live PTY
        await client.agent.attach(flags.name)
      }
      break
    }
    default:
      console.error(`Unknown agent subcommand: ${subcommand}`)
      process.exit(1)
  }

  client.close()
}

function parseFlags(args: string[]): Record<string, string> & { _?: string[] } {
  const flags: Record<string, string> = {}
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2)
      const value = args[i + 1] ?? ""
      if (!value.startsWith("--")) {
        flags[key] = value
        i++
      } else {
        flags[key] = "true"
      }
    } else {
      positional.push(args[i])
    }
  }
  return { ...flags, _: positional }
}
```

### 4c: `adlr context` (`commands/context.ts`)

**Files:**
- Create: `packages/cli/src/commands/context.ts`

- [ ] **Step 3: Write context command**

```ts
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../auto-start"
import { resolveSessionId } from "../resolve-session"

export async function run(args: string[], subcommand: string): Promise<void> {
  await ensureDaemon()
  const client = createClient()
  const sessionId = resolveSessionId({})
  if (!sessionId) {
    console.error("No active session. Run `adlr new` first.")
    process.exit(1)
  }

  const flags = parseFlags(args)

  switch (subcommand) {
    case "add": {
      const value = flags._?.[0] ?? ""
      let parsedValue: Record<string, unknown>
      try {
        parsedValue = JSON.parse(value)
      } catch {
        parsedValue = { text: value }
      }
      const item = await client.context.add({
        session_id: sessionId,
        type: flags.type as any,
        label: flags.label ?? null,
        description: flags.description ?? null,
        value: parsedValue,
      })
      console.log(`Added context item ${item.id}`)
      break
    }
    case "list": {
      const items = await client.context.list()
      for (const item of items) {
        console.log(`${item.type} ${item.label ?? ""} ${JSON.stringify(item.value)}`)
      }
      break
    }
    case "get": {
      const items = await client.context.list()
      const filtered = items.filter(i => {
        if (flags.type && i.type !== flags.type) return false
        if (flags.label && i.label !== flags.label) return false
        return true
      })
      for (const item of filtered) {
        console.log(JSON.stringify(item.value))
      }
      break
    }
    default:
      console.error(`Unknown context subcommand: ${subcommand}`)
      process.exit(1)
  }

  client.close()
}

function parseFlags(args: string[]): Record<string, string> & { _?: string[] } {
  const flags: Record<string, string> = {}
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2)
      const value = args[i + 1] ?? ""
      if (!value.startsWith("--")) {
        flags[key] = value
        i++
      } else {
        flags[key] = "true"
      }
    } else {
      positional.push(args[i])
    }
  }
  return { ...flags, _: positional }
}
```

### 4d: `adlr session` (`commands/session.ts`)

**Files:**
- Create: `packages/cli/src/commands/session.ts`

- [ ] **Step 4: Write session command**

```ts
import { createClient } from "@adlr/sdk"
import { ensureDaemon } from "../auto-start"

export async function run(subcommand: string): Promise<void> {
  await ensureDaemon()
  const client = createClient()

  switch (subcommand) {
    case "list": {
      const sessions = await client.session.list()
      for (const s of sessions) {
        console.log(`${s.id} ${s.status} ${s.working_dir}`)
      }
      break
    }
    default:
      console.error(`Unknown session subcommand: ${subcommand}`)
      process.exit(1)
  }

  client.close()
}
```

### 4e: `adlr init` (`commands/init.ts`)

**Files:**
- Create: `packages/cli/src/commands/init.ts`

- [ ] **Step 5: Write init command**

```ts
import { writeFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"

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

export async function run(): Promise<void> {
  const dir = join(process.cwd(), ".adlr")
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, "adlr.ts")
  if (existsSync(configPath)) {
    console.log("adlr.ts already exists")
    return
  }
  writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8")
  console.log(`Created ${configPath}`)
}
```

### 4f: `adlr daemon` (`commands/daemon.ts`)

**Files:**
- Create: `packages/cli/src/commands/daemon.ts`

- [ ] **Step 6: Write daemon command**

```ts
import { connect } from "net"
import { SOCKET_PATH, PID_FILE } from "@adlr/sdk"
import { readFileSync, existsSync } from "fs"

export async function run(subcommand: string): Promise<void> {
  switch (subcommand) {
    case "stop": {
      if (!existsSync(PID_FILE)) {
        console.log("Daemon is not running")
        return
      }
      const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10)
      try {
        process.kill(pid, "SIGTERM")
        console.log("Daemon stopped")
      } catch {
        console.error("Failed to stop daemon")
      }
      break
    }
    default:
      console.error(`Unknown daemon subcommand: ${subcommand}`)
      process.exit(1)
  }
}
```

- [ ] **Step 7: Commit all commands**

```bash
git add packages/cli/src/commands packages/cli/src/resolve-session.ts packages/cli/src/auto-start.ts
git commit -m "feat(cli): add all CLI commands"
```

---

## Task 5: Entry Point (`index.ts`)

**Files:**
- Create: `packages/cli/src/index.ts`

- [ ] **Step 1: Write entry point**

```ts
import { ensureDaemon } from "./auto-start"

const args = process.argv.slice(2)

async function main() {
  if (args.length === 0) {
    // Launch TUI
    await ensureDaemon()
    const { runTui } = await import("@adlr/tui")
    await runTui()
    return
  }

  const command = args[0]
  const subcommand = args[1]
  const rest = args.slice(2)

  switch (command) {
    case "new": {
      const { run } = await import("./commands/new")
      const flags = parseSimpleFlags(rest)
      await run({ goal: flags.goal })
      break
    }
    case "agent": {
      const { run } = await import("./commands/agent")
      await run(rest, subcommand)
      break
    }
    case "context": {
      const { run } = await import("./commands/context")
      await run(rest, subcommand)
      break
    }
    case "session": {
      const { run } = await import("./commands/session")
      await run(subcommand)
      break
    }
    case "init": {
      const { run } = await import("./commands/init")
      await run()
      break
    }
    case "daemon": {
      const { run } = await import("./commands/daemon")
      await run(subcommand)
      break
    }
    default:
      console.error(`Unknown command: ${command}`)
      process.exit(1)
  }
}

function parseSimpleFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2)
      const value = args[i + 1] ?? "true"
      if (!value.startsWith("--")) {
        flags[key] = value
        i++
      } else {
        flags[key] = "true"
      }
    }
  }
  return flags
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(cli): add entry point with command routing"
```

---

## Task 6: CLI Tests

**Files:**
- Create: `packages/cli/test/cli.test.ts`

- [ ] **Step 1: Write basic CLI tests**

```ts
import { test, expect, describe } from "bun:test"
import { resolveSessionId } from "../src/resolve-session"

describe("CLI", () => {
  test("resolveSessionId returns env var", () => {
    const old = process.env.ADLR_SESSION
    process.env.ADLR_SESSION = "env-sess"
    const id = resolveSessionId({})
    expect(id).toBe("env-sess")
    process.env.ADLR_SESSION = old
  })

  test("resolveSessionId prefers --session flag", () => {
    const old = process.env.ADLR_SESSION
    process.env.ADLR_SESSION = "env-sess"
    const id = resolveSessionId({ session: "flag-sess" })
    expect(id).toBe("flag-sess")
    process.env.ADLR_SESSION = old
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd packages/cli && bun test`
Expected: Tests PASS

- [ ] **Step 3: Commit**

```bash
git add packages/cli
git commit -m "feat(cli): add CLI tests"
```

---

## Self-Review

1. **Spec coverage:** §6 CLI commands (all commands listed), §6 Session Resolution (flag, env, file — all three), §4 Daemon auto-start (connect → spawn → poll), §4 Span context propagation (parentSpanId from env) — all covered.
2. **No placeholders:** All commands have complete implementations. No TODOs.
3. **Type consistency:** All types from `@adlr/sdk`. `resolveSessionId` matches the priority order exactly.

Plan complete.
