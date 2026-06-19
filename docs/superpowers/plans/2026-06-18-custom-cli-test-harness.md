# Custom CLI Test Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add env-based configuration for adlr runtime paths and build a subprocess CLI test harness so integration tests exercise the real `adlr` binary against an isolated daemon, never touching a user's live daemon.

**Architecture:** Convert hard-coded path constants in `@adlr/sdk` to env-aware getter functions (`ADLR_DIR`, `ADLR_SOCKET`, `ADLR_DB`, `ADLR_PID_FILE`). Thread a configurable `socketPath` through the daemon server. Then add a `CliProcess` fixture under `packages/cli/test/lib/cli-process.ts` that spawns the real `adlr` binary inside a temp home directory, propagating isolated `ADLR_DIR` so each test gets its own socket, DB, and PID file.

**Tech Stack:** TypeScript, Bun, `bun:test`, `@adlr/sdk`, `node:fs`, `node:os`, `node:path`

---

## File Structure

| File | Status | Responsibility |
|------|--------|-------------|
| `packages/sdk/src/paths.ts` | Modify | Env-aware path getters (`getAdlrDir`, `getSocketPath`, `getDbPath`, `getPidFile`) |
| `packages/sdk/src/client.ts` | Modify | Default `createClient` socket path uses `getSocketPath()` |
| `packages/daemon/src/lifecycle.ts` | Modify | Use `getAdlrDir()`, `getPidFile()`, `getSocketPath()` |
| `packages/daemon/src/index.ts` | Modify | Use `getDbPath()` for SQLite DB |
| `packages/daemon/src/server.ts` | Modify | Accept `socketPath` parameter, default to `getSocketPath()` |
| `packages/daemon/src/process-manager.ts` | Modify | Pass `getSocketPath()` as `ADLR_SOCKET` to agents |
| `packages/cli/src/auto-start.ts` | Modify | Use `getSocketPath()` for socket checks/spawn |
| `packages/cli/src/commands/daemon.ts` | Modify | Use `getPidFile()` for PID file operations |
| `packages/daemon/test/server.test.ts` | Modify | Use isolated socket path so tests don't bind to live daemon |
| `packages/cli/test/lib/cli-process.ts` | Create | Subprocess fixture: temp env, spawn `adlr`, capture output, cleanup |
| `packages/cli/test/cli.integration.test.ts` | Create | Integration tests for `adlr --help`, `new`, `session list`, `daemon stop` |
| `AGENTS.md` | Modify | Document env-based path config and subprocess test isolation |

---

### Task 1: Make SDK Paths Env-Aware

**Files:**
- Modify: `packages/sdk/src/paths.ts`
- Test: `packages/sdk/test/paths.test.ts` (create)

- [ ] **Step 1: Replace constants with getter functions**

```typescript
import { homedir } from "node:os";
import { join } from "node:path";

export function getAdlrDir(): string {
	return process.env.ADLR_DIR ?? join(homedir(), ".local/share/adlr");
}

export function getSocketPath(): string {
	return process.env.ADLR_SOCKET ?? join(getAdlrDir(), "adlr.sock");
}

export function getDbPath(): string {
	return process.env.ADLR_DB ?? join(getAdlrDir(), "adlr.db");
}

export function getPidFile(): string {
	return process.env.ADLR_PID_FILE ?? join(getAdlrDir(), "adlr.pid");
}
```

- [ ] **Step 2: Add path tests**

Create `packages/sdk/test/paths.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { getAdlrDir, getDbPath, getPidFile, getSocketPath } from "../src/paths";

describe("paths", () => {
	test("defaults to ~/.local/share/adlr", () => {
		delete process.env.ADLR_DIR;
		delete process.env.ADLR_SOCKET;
		delete process.env.ADLR_DB;
		delete process.env.ADLR_PID_FILE;

		const dir = getAdlrDir();
		expect(dir).toEndWith(".local/share/adlr");
		expect(getSocketPath()).toBe(`${dir}/adlr.sock`);
		expect(getDbPath()).toBe(`${dir}/adlr.db`);
		expect(getPidFile()).toBe(`${dir}/adlr.pid`);
	});

	test("ADLR_DIR overrides base directory", () => {
		process.env.ADLR_DIR = "/tmp/adlr-test";
		delete process.env.ADLR_SOCKET;
		delete process.env.ADLR_DB;
		delete process.env.ADLR_PID_FILE;

		expect(getAdlrDir()).toBe("/tmp/adlr-test");
		expect(getSocketPath()).toBe("/tmp/adlr-test/adlr.sock");
		expect(getDbPath()).toBe("/tmp/adlr-test/adlr.db");
		expect(getPidFile()).toBe("/tmp/adlr-test/adlr.pid");

		delete process.env.ADLR_DIR;
	});

	test("individual env vars override derived paths", () => {
		process.env.ADLR_DIR = "/tmp/adlr-test";
		process.env.ADLR_SOCKET = "/tmp/custom.sock";
		process.env.ADLR_DB = "/tmp/custom.db";
		process.env.ADLR_PID_FILE = "/tmp/custom.pid";

		expect(getSocketPath()).toBe("/tmp/custom.sock");
		expect(getDbPath()).toBe("/tmp/custom.db");
		expect(getPidFile()).toBe("/tmp/custom.pid");

		delete process.env.ADLR_DIR;
		delete process.env.ADLR_SOCKET;
		delete process.env.ADLR_DB;
		delete process.env.ADLR_PID_FILE;
	});
});
```

- [ ] **Step 3: Run SDK tests**

Run: `bun test packages/sdk/test/paths.test.ts`
Expected: All 3 tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/paths.ts packages/sdk/test/paths.test.ts
git commit -m "feat(sdk): env-aware runtime paths"
```

---

### Task 2: Update SDK Client Default Socket Path

**Files:**
- Modify: `packages/sdk/src/client.ts`

- [ ] **Step 1: Use `getSocketPath()` in client**

Change the import and default values:

```typescript
import { getSocketPath } from "./paths";
```

```typescript
export function createClient(socketPath: string = getSocketPath()): Client {
```

And in `env()`:

```typescript
env() {
	return {
		sessionId: process.env.ADLR_SESSION,
		spanId: process.env.ADLR_SPAN_ID,
		socketPath: process.env.ADLR_SOCKET ?? getSocketPath(),
	};
}
```

- [ ] **Step 2: Run SDK tests**

Run: `bun test packages/sdk/test/client.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/client.ts
git commit -m "feat(sdk): use env-aware socket path in client"
```

---

### Task 3: Update Daemon Lifecycle Paths

**Files:**
- Modify: `packages/daemon/src/lifecycle.ts`

- [ ] **Step 1: Use getter functions**

Update the import:

```typescript
import { getAdlrDir, getPidFile, getSocketPath } from "@adlr/sdk";
```

Replace every constant use with a function call:

```typescript
export function ensureAdlerDir(): void {
	const dir = getAdlrDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

export function writePid(): void {
	ensureAdlerDir();
	writeFileSync(getPidFile(), String(process.pid), "utf-8");
}

export function readPid(): number | null {
	const pidFile = getPidFile();
	if (!existsSync(pidFile)) return null;
	try {
		return parseInt(readFileSync(pidFile, "utf-8").trim(), 10);
	} catch {
		return null;
	}
}

export function removePid(): void {
	try {
		unlinkSync(getPidFile());
	} catch {}
}

export function removeSocket(): void {
	try {
		unlinkSync(getSocketPath());
	} catch {}
}
```

- [ ] **Step 2: Run daemon tests**

Run: `bun test packages/daemon/test/logger.test.ts packages/daemon/test/config-loader.test.ts packages/daemon/test/process-manager.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/lifecycle.ts
git commit -m "feat(daemon): use env-aware paths in lifecycle"
```

---

### Task 4: Update Daemon Entry Point DB Path

**Files:**
- Modify: `packages/daemon/src/index.ts`

- [ ] **Step 1: Use `getDbPath()`**

Update the import:

```typescript
import { getDbPath, SQLiteStorage } from "@adlr/sdk";
```

Update the storage construction:

```typescript
const storage = new SQLiteStorage(getDbPath());
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/index.ts
git commit -m "feat(daemon): use env-aware DB path"
```

---

### Task 5: Make Daemon Server Socket Path Configurable

**Files:**
- Modify: `packages/daemon/src/server.ts`

- [ ] **Step 1: Add `socketPath` parameter**

Update the import:

```typescript
import { getSocketPath } from "@adlr/sdk";
```

Update the signature:

```typescript
export function startServer(
	storage: Storage,
	getProcessManager: () => ProcessManager,
	inactivity: InactivityTimer,
	logger?: DaemonLogger,
	socketPath: string = getSocketPath(),
): {
	close: () => void;
	broadcast: (
		sessionId: string,
		event: { type: string; payload: unknown },
	) => void;
} {
```

Update the listen call:

```typescript
server.listen(socketPath);
```

- [ ] **Step 2: Commit**

```bash
git add packages/daemon/src/server.ts
git commit -m "feat(daemon): configurable socket path in server"
```

---

### Task 6: Update Process Manager Agent Socket Env

**Files:**
- Modify: `packages/daemon/src/process-manager.ts`

- [ ] **Step 1: Use `getSocketPath()` for spawned agents**

Update the import:

```typescript
import { getSocketPath } from "@adlr/sdk";
```

Update the agent env:

```typescript
const env = {
	...process.env,
	ADLR_SESSION: data.sessionId,
	ADLR_SPAN_ID: span.id,
	ADLR_SOCKET: getSocketPath(),
	ADLR_AGENT_PROMPT: data.prompt,
	ADLR_CONTEXT: JSON.stringify(contextItems),
};
```

- [ ] **Step 2: Run daemon tests**

Run: `bun test packages/daemon/test/process-manager.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/process-manager.ts
git commit -m "feat(daemon): propagate env-aware socket path to agents"
```

---

### Task 7: Update CLI Auto-Start Socket Path

**Files:**
- Modify: `packages/cli/src/auto-start.ts`

- [ ] **Step 1: Use `getSocketPath()`**

Update the import:

```typescript
import { getSocketPath } from "@adlr/sdk";
```

Update `ensureDaemon` to read the socket path at call time:

```typescript
export async function ensureDaemon(): Promise<void> {
	const socketPath = getSocketPath();

	if (existsSync(socketPath)) {
		if (await canConnect(socketPath)) {
			return;
		}
		unlinkSync(socketPath);
	}

	const daemonPath = new URL("../../daemon/src/index.ts", import.meta.url)
		.pathname;
	const proc = spawn(process.execPath, [daemonPath], {
		detached: true,
		stdio: ["ignore", "ignore", "pipe"],
	});
	proc.unref();

	// ... keep existing stderr/exit tracking ...

	const start = Date.now();
	while (Date.now() - start < DAEMON_START_TIMEOUT_MS) {
		await setTimeout(DAEMON_POLL_INTERVAL_MS);

		if (spawnError) {
			throw spawnError;
		}
		if (exitCode !== null) {
			const detail = stderrOutput.trim();
			const msg = detail
				? `Daemon exited with code ${exitCode}:\n${detail}`
				: `Daemon exited with code ${exitCode}`;
			throw new Error(msg);
		}
		if (exitSignal !== null) {
			const detail = stderrOutput.trim();
			const msg = detail
				? `Daemon was killed by signal ${exitSignal}:\n${detail}`
				: `Daemon was killed by signal ${exitSignal}`;
			throw new Error(msg);
		}
		if (await canConnect(socketPath)) {
			return;
		}
	}
	const detail = stderrOutput.trim();
	const msg = detail
		? `Daemon failed to start within 5 seconds:\n${detail}`
		: "Daemon failed to start within 5 seconds";
	throw new Error(msg);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/auto-start.ts
git commit -m "feat(cli): use env-aware socket path for daemon auto-start"
```

---

### Task 8: Update CLI Daemon Stop Command

**Files:**
- Modify: `packages/cli/src/commands/daemon.ts`

- [ ] **Step 1: Use `getPidFile()`**

Update the import:

```typescript
import { getPidFile } from "@adlr/sdk";
```

Update the action:

```typescript
.addCommand(
	new Command("stop").description("Stop the daemon").action(async () => {
		const pidFile = getPidFile();
		if (!existsSync(pidFile)) {
			console.log("Daemon is not running");
			return;
		}
		const raw = readFileSync(pidFile, "utf-8").trim();
		const pid = parseInt(raw, 10);
		if (Number.isNaN(pid)) {
			console.error("Corrupted PID file: not a valid number");
			return;
		}
		try {
			process.kill(pid, "SIGTERM");
			console.log("Daemon stopped");
		} catch {
			console.error("Failed to stop daemon");
		}
	}),
)
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/commands/daemon.ts
git commit -m "feat(cli): use env-aware PID file in daemon stop"
```

---

### Task 9: Isolate Daemon Server Tests from Live Socket

**Files:**
- Modify: `packages/daemon/test/server.test.ts`

- [ ] **Step 1: Use temp socket path per test**

Update imports:

```typescript
import { mkdtempSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getSocketPath, SQLiteStorage } from "@adlr/sdk";
```

Add a helper and update `beforeEach`/`afterEach`:

```typescript
function createTestSocketPath(): string {
	const tmpDir = mkdtempSync(join(tmpdir(), "adlr-daemon-test-"));
	return join(tmpDir, "adlr.sock");
}

describe("Daemon server", () => {
	let storage: SQLiteStorage;
	let pm: ProcessManager;
	let server: ReturnType<typeof startServer>;
	let inactivity: InactivityTimer;
	let testSocketPath: string;

	beforeEach(async () => {
		testSocketPath = createTestSocketPath();
		process.env.ADLR_SOCKET = testSocketPath;

		if (existsSync(testSocketPath)) unlinkSync(testSocketPath);
		const socketDir = dirname(testSocketPath);
		if (!existsSync(socketDir)) mkdirSync(socketDir, { recursive: true });

		storage = new SQLiteStorage(":memory:");
		pm = new ProcessManager(storage, new ConfigLoader(), () => {});
		inactivity = new InactivityTimer(() => {});
		server = startServer(storage, () => pm, inactivity, undefined, testSocketPath);
		await new Promise((r) => setTimeout(r, 100));
	});

	afterEach(() => {
		server.close();
		pm.stop();
		inactivity.stop();
		storage.close();
		if (existsSync(testSocketPath)) unlinkSync(testSocketPath);
		delete process.env.ADLR_SOCKET;
	});

	// ... keep tests, replacing `SOCKET_PATH` with `testSocketPath` ...
});
```

- [ ] **Step 2: Run daemon server tests**

Run: `bun test packages/daemon/test/server.test.ts`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/test/server.test.ts
git commit -m "test(daemon): isolate server tests with temp socket path"
```

---

### Task 10: Create CLI Subprocess Test Harness

**Files:**
- Create: `packages/cli/test/lib/cli-process.ts`

- [ ] **Step 1: Write the harness**

```typescript
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface RunResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
	durationMs: number;
}

export interface CliProcessOptions {
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
}

export class CliProcess {
	readonly tmpDir: string;
	readonly adlrDir: string;
	readonly repoRoot: string;
	private proc: Bun.Subprocess<"ignore", "pipe", "pipe"> | null = null;

	constructor() {
		this.repoRoot = resolve(import.meta.dir, "../../../../");
		this.tmpDir = mkdtempSync(join(tmpdir(), "adlr-cli-test-"));
		this.adlrDir = join(this.tmpDir, "adlr");
		mkdirSync(this.adlrDir, { recursive: true });
	}

	private baseEnv(): Record<string, string> {
		return {
			...process.env,
			HOME: this.tmpDir,
			XDG_DATA_HOME: join(this.tmpDir, ".local", "share"),
			XDG_CONFIG_HOME: join(this.tmpDir, ".config"),
			XDG_CACHE_HOME: join(this.tmpDir, ".cache"),
			XDG_STATE_HOME: join(this.tmpDir, ".local", "state"),
			ADLR_DIR: this.adlrDir,
		};
	}

	spawn(
		args: string[],
		options: CliProcessOptions = {},
	): Bun.Subprocess<"ignore", "pipe", "pipe"> {
		const binaryPath = resolve(this.repoRoot, "packages/cli/src/index.ts");
		this.proc = Bun.spawn([process.execPath, binaryPath, ...args], {
			cwd: options.cwd ?? this.repoRoot,
			env: {
				...this.baseEnv(),
				...options.env,
			},
			stdout: "pipe",
			stderr: "pipe",
			stdin: "ignore",
		});
		return this.proc;
	}

	async run(
		args: string[],
		options: CliProcessOptions = {},
	): Promise<RunResult> {
		const proc = this.spawn(args, options);
		const start = Date.now();
		const timeout = options.timeoutMs ?? 30000;

		const timer = setTimeout(() => {
			proc.kill();
		}, timeout);

		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		clearTimeout(timer);

		const exitCode = await proc.exited;
		return {
			exitCode,
			stdout,
			stderr,
			durationMs: Date.now() - start,
		};
	}

	async stopDaemon(): Promise<void> {
		try {
			await this.run(["daemon", "stop"], { timeoutMs: 5000 });
		} catch {
			// ignore cleanup errors
		}
	}

	async cleanup(): Promise<void> {
		await this.stopDaemon();
		if (this.proc && this.proc.pid) {
			try {
				this.proc.kill();
			} catch {}
			try {
				await Promise.race([
					this.proc.exited,
					new Promise((r) => setTimeout(r, 1000)),
				]);
			} catch {}
		}
		rmSync(this.tmpDir, { recursive: true, force: true });
	}
}

export function expectExit(result: RunResult, expected: number): void {
	if (result.exitCode !== expected) {
		throw new Error(
			`Expected exit code ${expected} but got ${result.exitCode}\n\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`,
		);
	}
}
```

- [ ] **Step 2: Verify harness compiles**

Run: `bun typecheck --filter='*'`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add packages/cli/test/lib/cli-process.ts
git commit -m "test(cli): add subprocess CLI test harness"
```

---

### Task 11: Add CLI Integration Tests

**Files:**
- Create: `packages/cli/test/cli.integration.test.ts`

- [ ] **Step 1: Write integration tests**

```typescript
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { CliProcess, expectExit } from "./lib/cli-process";

describe("CLI integration", () => {
	let cli: CliProcess;
	let projectDir: string;

	beforeEach(() => {
		cli = new CliProcess();
		projectDir = mkdtempSync(join(cli.tmpDir, "project-"));
		mkdirSync(projectDir, { recursive: true });
	});

	afterEach(async () => {
		await cli.cleanup();
	});

	test("shows help and exits 0", async () => {
		const result = await cli.run(["--help"]);
		expectExit(result, 0);
		expect(result.stdout).toContain("Usage:");
		expect(result.stdout).toContain("adlr");
	});

	test("errors on unknown command", async () => {
		const result = await cli.run(["unknown-command"]);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr + result.stdout).toContain("error");
	});

	test("adlr new creates a session and writes .adlr/.session", async () => {
		const result = await cli.run(["new"], { cwd: projectDir });
		expectExit(result, 0);
		expect(result.stdout).toMatch(/Created session .+/);
		expect(existsSync(join(projectDir, ".adlr", ".session"))).toBe(true);
	});

	test("adlr session list shows created session", async () => {
		const newResult = await cli.run(["new"], { cwd: projectDir });
		expectExit(newResult, 0);
		const match = newResult.stdout.match(/Created session (.+)/);
		expect(match).not.toBeNull();
		const sessionId = match![1];

		const listResult = await cli.run(["session", "list"]);
		expectExit(listResult, 0);
		expect(listResult.stdout).toContain(sessionId);
	});

	test("adlr daemon stop stops a running daemon", async () => {
		const newResult = await cli.run(["new"], { cwd: projectDir });
		expectExit(newResult, 0);

		const stopResult = await cli.run(["daemon", "stop"]);
		expectExit(stopResult, 0);
		expect(stopResult.stdout).toContain("Daemon stopped");
	});
});
```

- [ ] **Step 2: Run integration tests**

Run: `bun test packages/cli/test/cli.integration.test.ts`
Expected: All 5 tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/cli/test/cli.integration.test.ts
git commit -m "test(cli): add subprocess integration tests"
```

---

### Task 12: Document Env-Based Configuration and Test Isolation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add env config section**

After the "Runtime & architecture" section, add:

```markdown
## Environment-based configuration

Runtime paths can be overridden via environment variables. This is used by the test harness to keep tests isolated from the user's live daemon.

| Env var | Fallback | Controls |
|---|---|---|
| `ADLR_DIR` | `~/.local/share/adlr` | Base directory for socket, DB, and PID file |
| `ADLR_SOCKET` | `$ADLR_DIR/adlr.sock` | Unix socket path |
| `ADLR_DB` | `$ADLR_DIR/adlr.db` | SQLite database path |
| `ADLR_PID_FILE` | `$ADLR_DIR/adlr.pid` | Daemon PID file path |

The CLI, daemon, SDK client, and spawned agents all read these values through `@adlr/sdk` path getters so a single `ADLR_DIR` override is sufficient for full isolation.
```

- [ ] **Step 2: Update testing notes**

Replace the existing "Tests should not be run against a live daemon" warning with:

```markdown
- Tests never bind to the default socket path. Daemon server tests create a temp socket per test, and CLI integration tests spawn the real binary inside a temp `HOME`/`ADLR_DIR` so each test gets its own daemon.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: document env-based path config and test isolation"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 2: Run lint**

Run: `bun lint`
Expected: No lint errors

- [ ] **Step 3: Run typecheck**

Run: `bun typecheck`
Expected: No type errors

- [ ] **Step 4: Commit if all pass**

```bash
git commit --allow-empty -m "chore: verify custom CLI test harness"
```

---

## Spec Coverage Check

| Requirement | Task |
|---|---|
| Support env-based configuration | Tasks 1–8 (`ADLR_DIR`, `ADLR_SOCKET`, `ADLR_DB`, `ADLR_PID_FILE`) |
| Configurable socket path for testing | Tasks 1, 5, 9 (`getSocketPath()`, `startServer` param, isolated daemon tests) |
| Tests should not run against a live daemon | Tasks 9, 10, 11 (temp socket per test, temp `ADLR_DIR` per CLI test, cleanup) |
| Custom test harness similar to opencode | Tasks 10, 11 (`CliProcess` fixture + integration tests) |
| Document changes | Task 12 (`AGENTS.md`) |

---

## Placeholder Scan

- No "TBD", "TODO", or "implement later" found.
- No vague requirements like "add appropriate error handling".
- All steps contain exact file paths and code.
- No "Similar to Task N" references.

---

## Type Consistency Check

- `getAdlrDir`, `getSocketPath`, `getDbPath`, `getPidFile` are all `(): string` and defined in Task 1.
- `createClient` defaults to `getSocketPath()` in Task 2.
- `startServer` accepts `socketPath: string = getSocketPath()` in Task 5.
- `CliProcess` exposes `tmpDir: string` and uses `process.execPath` consistently in Task 10.
- Integration tests access `cli.tmpDir` to create `projectDir` in Task 11.

All types and names are consistent.
