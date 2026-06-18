import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import React from "react";
import App from "./app.tsx";
import { createAdlerKeymap } from "./keymap.ts";
import { loadConfig } from "./loadConfig.ts";

function resolveSessionId(): string | undefined {
	if (process.env.ADLER_SESSION) return process.env.ADLER_SESSION;
	const localFile = join(process.cwd(), ".adler", ".session");
	if (existsSync(localFile)) {
		return readFileSync(localFile, "utf-8").trim();
	}
	return undefined;
}

export async function runTui(): Promise<() => void> {
	const sessionId = resolveSessionId();
	if (!sessionId) {
		console.error("No active session. Run `adler new` first.");
		process.exit(1);
	}

	const config = await loadConfig(process.cwd());

	const renderer = await createCliRenderer({
		screenMode: "alternate-screen",
		exitOnCtrlC: false,
	});

	const keymap = createAdlerKeymap(renderer);

	createRoot(renderer).render(
		React.createElement(App, {
			sessionId: sessionId as string,
			config,
			keymap,
		}),
	);

	return () => {
		renderer.destroy();
	};
}
