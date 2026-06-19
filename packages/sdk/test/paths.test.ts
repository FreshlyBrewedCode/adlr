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
