import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
		this.repoRoot = resolve(import.meta.dir, "../../../");
		this.tmpDir = mkdtempSync(join(tmpdir(), "adlr-cli-test-"));
		this.adlrDir = join(this.tmpDir, "adlr");
		mkdirSync(this.adlrDir, { recursive: true });
	}

	private baseEnv(): Record<string, string> {
		const { ADLR_SOCKET, ADLR_DB, ADLR_PID_FILE, ...rest } = process.env;
		return {
			...rest,
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
		if (this.proc?.pid) {
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
