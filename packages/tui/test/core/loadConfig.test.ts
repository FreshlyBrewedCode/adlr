import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { loadConfig as LoadConfigFn } from "../../src/loadConfig.ts";

// Use a cache-busting import to bypass any mock.module() override from other test files
// (e.g. index.test.ts mocks this module and the override persists across files)
// @ts-expect-error bun cache-busting import with ?fresh=1 query
const { loadConfig } = (await import("../../src/loadConfig.ts?fresh=1")) as {
	loadConfig: typeof LoadConfigFn;
};

const tmpDir = join(
	tmpdir(),
	`adler-loadconfig-test-${process.pid}-${Date.now()}`,
);
const adlerDir = join(tmpDir, ".adler");
const configFile = join(adlerDir, "adler.ts");

beforeAll(() => {
	mkdirSync(adlerDir, { recursive: true });
	writeFileSync(
		configFile,
		`export default { tui: { layout: { layout: "split", ratio: 0.6, content: ["agents", "logs"] } } }\n`,
	);
});

afterAll(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
	test("loads project config with tui layout", async () => {
		const config = await loadConfig(tmpDir);
		expect(config.tui?.layout).toBeDefined();
		expect(config.tui?.layout?.layout).toBe("split");
		expect(config.tui?.layout?.ratio).toBe(0.6);
	});

	test("returns empty config for non-existent directory", async () => {
		const config = await loadConfig("/tmp/non-existent-adler-project");
		expect(config.tui).toBeUndefined();
	});
});
