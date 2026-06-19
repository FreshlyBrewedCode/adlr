import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { getAdlrDir, getDbPath, getPidFile, getSocketPath } from "../src/paths";

describe("paths", () => {
	beforeEach(() => {
		delete process.env.ADLR_DIR;
		delete process.env.ADLR_SOCKET;
		delete process.env.ADLR_DB;
		delete process.env.ADLR_PID_FILE;
	});

	test("defaults to ~/.local/share/adlr", () => {
		const dir = getAdlrDir();
		expect(dir).toEndWith(".local/share/adlr");
		expect(getSocketPath()).toBe(join(dir, "adlr.sock"));
		expect(getDbPath()).toBe(join(dir, "adlr.db"));
		expect(getPidFile()).toBe(join(dir, "adlr.pid"));
	});

	test("ADLR_DIR overrides base directory", () => {
		process.env.ADLR_DIR = "/tmp/adlr-test";

		expect(getAdlrDir()).toBe("/tmp/adlr-test");
		expect(getSocketPath()).toBe(join("/tmp/adlr-test", "adlr.sock"));
		expect(getDbPath()).toBe(join("/tmp/adlr-test", "adlr.db"));
		expect(getPidFile()).toBe(join("/tmp/adlr-test", "adlr.pid"));
	});

	test("individual env vars override derived paths", () => {
		process.env.ADLR_DIR = "/tmp/adlr-test";
		process.env.ADLR_SOCKET = "/tmp/custom.sock";
		process.env.ADLR_DB = "/tmp/custom.db";
		process.env.ADLR_PID_FILE = "/tmp/custom.pid";

		expect(getSocketPath()).toBe("/tmp/custom.sock");
		expect(getDbPath()).toBe("/tmp/custom.db");
		expect(getPidFile()).toBe("/tmp/custom.pid");
	});
});
