import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCli } from "../src/cli";
import { AdlrCliError } from "../src/error";
import { resolveSessionId } from "../src/resolve-session";

describe("CLI", () => {
	let oldSession: string | undefined;

	beforeEach(() => {
		oldSession = process.env.ADLR_SESSION;
		delete process.env.ADLR_SESSION;
	});

	afterEach(() => {
		if (oldSession !== undefined) {
			process.env.ADLR_SESSION = oldSession;
		} else {
			delete process.env.ADLR_SESSION;
		}
	});

	test("resolveSessionId returns env var", () => {
		process.env.ADLR_SESSION = "env-sess";
		const id = resolveSessionId({});
		expect(id).toBe("env-sess");
	});

	test("resolveSessionId prefers explicit session argument over env var", () => {
		process.env.ADLR_SESSION = "env-sess";
		const id = resolveSessionId({ session: "flag-sess" });
		expect(id).toBe("flag-sess");
	});

	test("resolveSessionId reads .adlr/.session file", () => {
		const sessionDir = join(process.cwd(), ".adlr");
		const sessionFile = join(sessionDir, ".session");
		const dirExistedBefore = existsSync(sessionDir);
		mkdirSync(sessionDir, { recursive: true });
		writeFileSync(sessionFile, " file-sess \n", "utf-8");
		try {
			const id = resolveSessionId({});
			expect(id).toBe("file-sess");
		} finally {
			unlinkSync(sessionFile);
			// Only remove the directory if we created it (i.e., it didn't exist before)
			if (!dirExistedBefore && existsSync(sessionDir)) {
				const { rmdirSync } = require("node:fs");
				try {
					rmdirSync(sessionDir);
				} catch {
					/* may not be empty */
				}
			}
		}
	});

	test("resolveSessionId returns undefined when nothing set", () => {
		const id = resolveSessionId({});
		expect(id).toBeUndefined();
	});

	test("AdlrCliError has correct name and message", () => {
		const err = new AdlrCliError("test message");
		expect(err.name).toBe("AdlrCliError");
		expect(err.message).toBe("test message");
	});

	test("CLI shows help for unknown command", async () => {
		const cli = buildCli();
		cli.exitOverride();
		let output = "";
		cli.configureOutput({
			writeErr: (str) => {
				output += str;
			},
		});
		await expect(cli.parseAsync(["node", "adlr", "unknown"])).rejects.toThrow();
		expect(output).toContain("error: unknown command");
	});

	test("CLI shows help for agent command", async () => {
		const cli = buildCli();
		cli.exitOverride();
		let output = "";
		const capture = (str: string) => {
			output += str;
		};
		cli.configureOutput({
			writeOut: capture,
			writeErr: capture,
		});
		cli.commands.forEach((cmd) => {
			cmd.exitOverride();
			cmd.configureOutput({ writeOut: capture, writeErr: capture });
			cmd.commands.forEach((sub) => {
				sub.exitOverride();
				sub.configureOutput({ writeOut: capture, writeErr: capture });
			});
		});
		await expect(
			cli.parseAsync(["node", "adlr", "agent", "--help"]),
		).rejects.toThrow();
		expect(output).toContain("Usage:");
		expect(output).toContain("run");
		expect(output).toContain("list");
	});
});
