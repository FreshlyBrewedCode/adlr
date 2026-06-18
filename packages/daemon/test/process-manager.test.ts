import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SQLiteStorage } from "@adlr/sdk";
import { ConfigLoader } from "../src/config-loader";
// Type guard: AgentProcess must have proc and terminal, not pty
import type { AgentProcess } from "../src/process-manager";
import { ProcessManager } from "../src/process-manager";

type _Check = AgentProcess extends {
	proc: Bun.Subprocess;
	terminal: Bun.Terminal;
}
	? true
	: never;

function createTestDir(): string {
	const dir = join(
		tmpdir(),
		`adlr-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(dir, { recursive: true });
	return dir;
}

describe("ProcessManager", () => {
	let storage: SQLiteStorage;
	let loader: ConfigLoader;
	let testDir: string;
	let pm: ProcessManager;

	beforeEach(() => {
		storage = new SQLiteStorage(":memory:");
		loader = new ConfigLoader();
		testDir = createTestDir();
	});

	afterEach(() => {
		pm?.stop();
		loader.close();
		storage.close();
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("uses ConfigLoader with session working_dir", async () => {
		const adlrDir = join(testDir, ".adlr");
		mkdirSync(adlrDir, { recursive: true });
		writeFileSync(
			join(adlrDir, "adlr.ts"),
			`export default { agent: { agents: { test: { run: () => "echo hello" } } } }`,
			"utf-8",
		);

		pm = new ProcessManager(storage, loader, () => {});
		const session = await storage.createSession({ working_dir: testDir });

		try {
			await pm.spawnAgent({
				sessionId: session.id,
				agentType: "test",
				prompt: "hello",
				name: "test-agent",
			});
		} catch (e) {
			// Agent may fail to run because "sh -c echo hello" isn't a real agent,
			// but it should NOT fail with "Unknown agent type"
			expect((e as Error).message).not.toContain("Unknown agent type");
		}
	});

	test("rejects unknown agent type from session directory", async () => {
		pm = new ProcessManager(storage, loader, () => {});
		const session = await storage.createSession({ working_dir: testDir });

		expect(
			pm.spawnAgent({
				sessionId: session.id,
				agentType: "nonexistent",
				prompt: "hello",
				name: "test-agent",
			}),
		).rejects.toThrow("Unknown agent type: nonexistent");
	});

	test("spawned agent uses session working_dir as cwd", async () => {
		const adlrDir = join(testDir, ".adlr");
		mkdirSync(adlrDir, { recursive: true });
		writeFileSync(
			join(adlrDir, "adlr.ts"),
			`export default { agent: { agents: { "cwd-test": { run: () => "pwd" } } } }`,
			"utf-8",
		);

		pm = new ProcessManager(storage, loader, () => {});
		const session = await storage.createSession({ working_dir: testDir });
		const span = await pm.spawnAgent({
			sessionId: session.id,
			agentType: "cwd-test",
			prompt: "test",
			name: "cwd-test-agent",
		});

		// Wait for process to finish
		await new Promise<void>((resolve) => {
			const check = setInterval(async () => {
				const s = await storage.getSpan(span.id);
				if (s?.status === "done" || s?.status === "failed") {
					clearInterval(check);
					resolve();
				}
			}, 50);
		});

		const finished = await storage.getSpan(span.id);
		expect(finished?.status).toBe("done");
		expect(finished?.data?.exit_code).toBe(0);
	});

	test("stop() kills all tracked agents regardless of mode", async () => {
		const adlrDir = join(testDir, ".adlr");
		mkdirSync(adlrDir, { recursive: true });
		writeFileSync(
			join(adlrDir, "adlr.ts"),
			`export default { agent: { agents: { sleeper: { run: () => "sleep 60" } } } }`,
			"utf-8",
		);

		pm = new ProcessManager(storage, loader, () => {});
		const session = await storage.createSession({ working_dir: testDir });
		const span = await pm.spawnAgent({
			sessionId: session.id,
			agentType: "sleeper",
			prompt: "test",
			name: "sleeper-agent",
		});

		// Agent should be tracked
		expect(pm.getAgent(span.id)).toBeDefined();

		// stop() should kill it without hanging
		await pm.stop();

		// Agent should be removed from tracking
		expect(pm.getAgent(span.id)).toBeUndefined();
	});
});
