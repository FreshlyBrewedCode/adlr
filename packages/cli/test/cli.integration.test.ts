import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { CliProcess, expectExit } from "@adlr/test-utils";

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
		// biome-ignore lint/style/noNonNullAssertion: guarded by the expect above
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
