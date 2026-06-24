import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@adlr/sdk";
import { CliProcess } from "@adlr/test-utils";
import { ObservabilityPlugin } from "../src/index";

const opencodeBinary = "opencode";

function opencodeAvailable(): boolean {
	try {
		Bun.spawnSync([opencodeBinary, "--version"]);
		return true;
	} catch {
		return false;
	}
}

describe("opencode plugin daemon integration", () => {
	let cli: CliProcess;
	let projectDir: string;
	let socketPath: string;
	let sessionId: string;

	beforeEach(async () => {
		cli = new CliProcess();
		projectDir = mkdtempSync(join(cli.tmpDir, "project-"));
		mkdirSync(projectDir, { recursive: true });
		socketPath = join(cli.adlrDir, "adlr.sock");

		const newResult = await cli.run(["new"], { cwd: projectDir });
		expect(newResult.exitCode).toBe(0);
		const match = newResult.stdout.match(/Created session (.+)/);
		expect(match).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: guarded by the expect above
		sessionId = match![1];
	});

	afterEach(async () => {
		await cli.cleanup();
	});

	test("plugin handles opencode events and emits span events to the daemon", async () => {
		process.env.ADLR_SESSION = sessionId;
		process.env.ADLR_SOCKET = socketPath;
		delete process.env.ADLR_SPAN_ID;

		const plugin = await ObservabilityPlugin({});
		expect(typeof plugin.event).toBe("function");

		const client = createClient(socketPath);
		const events: { type: string; payload: unknown }[] = [];
		const unsubscribe = await client.subscribe(sessionId, (msg) => {
			if (msg.type === "event") {
				events.push({
					type: msg.event,
					payload: msg.payload,
				});
			}
		});

		try {
			await plugin.event?.({
				event: {
					type: "session.updated",
					properties: {
						info: {
							id: "opencode-session-1",
							tokens: { input: 10, output: 5 },
							cost: 0.001,
						},
					},
				},
			});

			await plugin.event?.({
				event: {
					type: "session.created",
					properties: {
						info: {
							id: "opencode-subagent-1",
							parentID: "opencode-session-1",
							title: "subagent",
						},
					},
				},
			});

			const spanEvents = events.filter(
				(e) => e.type === "span.started" || e.type === "span.finished",
			);
			expect(spanEvents.length).toBeGreaterThan(0);
		} finally {
			unsubscribe();
			client.close();
		}
	});
});

describe("opencode plugin binary integration", () => {
	if (!opencodeAvailable()) {
		test.skip("opencode binary not available", () => {});
		return;
	}

	let cli: CliProcess;
	let projectDir: string;
	let opencodeConfigDir: string;
	let repoRoot: string;
	let serveProc: ReturnType<typeof Bun.spawn> | null = null;

	beforeEach(() => {
		repoRoot = resolve(import.meta.dir, "../../../../");
		cli = new CliProcess();
		projectDir = mkdtempSync(join(cli.tmpDir, "project-"));

		// Isolated opencode config dir under /tmp.
		// We put @opencode-ai/plugin here so opencode can resolve the plugin
		// package from .opencode/plugins/ without triggering an npm install.
		opencodeConfigDir = mkdtempSync("/tmp/adlr-oc-cfg-");
		const globalPluginDir = resolve(
			// Use the real (pre-test-run) HOME to find the installed plugin
			process.env.HOME ?? "~",
			".config/opencode/node_modules/@opencode-ai/plugin",
		);
		mkdirSync(join(opencodeConfigDir, "node_modules/@opencode-ai"), {
			recursive: true,
		});
		symlinkSync(
			globalPluginDir,
			join(opencodeConfigDir, "node_modules/@opencode-ai/plugin"),
			"dir",
		);

		// Project .opencode: plugins/ dir + @adlr/sdk symlink.
		const opencodeDir = join(projectDir, ".opencode");
		const pluginsDir = join(opencodeDir, "plugins");
		const adlrLinkDir = join(opencodeDir, "node_modules", "@adlr");
		mkdirSync(pluginsDir, { recursive: true });
		mkdirSync(adlrLinkDir, { recursive: true });

		// Symlink @adlr/sdk so the plugin can resolve its imports without needing
		// a full workspace install (which would fail on catalog references).
		symlinkSync(
			resolve(repoRoot, "packages/sdk"),
			join(adlrLinkDir, "sdk"),
			"dir",
		);

		// Plugin file: wraps the package under test.
		const pluginSourcePath = resolve(
			repoRoot,
			"packages/plugins/opencode/src/index.ts",
		);
		writeFileSync(
			join(pluginsDir, "adlr.ts"),
			[
				`import { ObservabilityPlugin as _P } from "${pluginSourcePath}";`,
				`export const ObservabilityPlugin = async (ctx: unknown) => _P(ctx);`,
			].join("\n"),
		);
	});

	afterEach(async () => {
		serveProc?.kill();
		serveProc = null;
		await cli.cleanup();
		try {
			rmSync(opencodeConfigDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	test("opencode run creates and finishes a span in the adlr daemon via the plugin", async () => {
		const newResult = await cli.run(["new"], { cwd: projectDir });
		expect(newResult.exitCode).toBe(0);
		const match = newResult.stdout.match(/Created session (.+)/);
		expect(match).not.toBeNull();
		// biome-ignore lint/style/noNonNullAssertion: guarded by the expect above
		const sessionId = match![1];
		const socketPath = join(cli.adlrDir, "adlr.sock");

		// Strip any ADLR_* vars leaked from the daemon-integration test that runs
		// first in this file, then inject the test-specific ones.
		// Also strip HOME and XDG_* so the isolated HOME below takes effect.
		const {
			ADLR_SESSION: _s,
			ADLR_SOCKET: _k,
			ADLR_DIR: _d,
			ADLR_DB: _b,
			ADLR_PID_FILE: _p,
			ADLR_SPAN_ID: _i,
			HOME: _h,
			XDG_CONFIG_HOME: _xch,
			XDG_DATA_HOME: _xdh,
			XDG_CACHE_HOME: _xcah,
			XDG_STATE_HOME: _xsh,
			...baseEnv
		} = process.env;

		// opencode serve + run --attach: run a dedicated opencode server for the
		// project dir so our plugin loads in that server, then connect the run
		// command to it.  Without this, opencode run (in piped/non-TTY mode) will
		// auto-discover and reuse any already-running opencode server on the
		// machine, which means the plugin never loads for the session.
		//
		// HOME is isolated so opencode's server-discovery heuristics don't find
		// the developer's real opencode instance. OPENCODE_CONFIG_DIR points to
		// our isolated dir (with the @opencode-ai/plugin symlink) so opencode can
		// resolve the plugin package without an npm install.
		const opencodeEnv = {
			...baseEnv,
			HOME: cli.tmpDir,
			OPENCODE_CONFIG_DIR: opencodeConfigDir,
			ADLR_DIR: cli.adlrDir,
			ADLR_SESSION: sessionId,
			ADLR_SOCKET: socketPath,
		};

		// Pick an ephemeral port for the opencode HTTP server.
		const servePort = 19000 + Math.floor(Math.random() * 1000);
		const serverUrl = `http://localhost:${servePort}`;

		serveProc = Bun.spawn(
			[opencodeBinary, "serve", "--port", String(servePort)],
			{
				cwd: projectDir,
				env: opencodeEnv,
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		// Wait for the server to accept connections (up to 15 s).
		let ready = false;
		for (let i = 0; i < 30; i++) {
			await new Promise((r) => setTimeout(r, 500));
			try {
				const res = await fetch(`${serverUrl}/api/session`);
				if (res.ok) {
					ready = true;
					break;
				}
			} catch {
				// not ready yet
			}
		}
		expect(ready).toBe(true);

		// Run opencode, attaching to our isolated server.
		const runProc = Bun.spawn(
			[
				opencodeBinary,
				"run",
				"--attach",
				serverUrl,
				"--model",
				"opencode/big-pickle",
				"say DONE",
			],
			{
				cwd: projectDir,
				env: opencodeEnv,
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		const opencodeTimeout = setTimeout(() => {
			runProc.kill();
		}, 90000);

		try {
			await runProc.exited;
		} finally {
			clearTimeout(opencodeTimeout);
		}

		expect(runProc.exitCode).toBe(0);

		// The plugin should have created a root span named "opencode" and finished
		// it when session.idle fired.
		const client = createClient(socketPath);
		try {
			const spans = await client.span.list(sessionId);
			const rootSpan = spans.find((s) => s.name === "opencode");
			expect(rootSpan).toBeDefined();
			expect(rootSpan?.status).toBe("done");
			expect(rootSpan?.finished_at).not.toBeNull();
		} finally {
			client.close();
		}
	}, 90000);
});
