import { existsSync } from "node:fs";
import { createClient } from "@adlr/sdk";
import { handleEvent } from "./handle-event";
import { resolveMode } from "./resolve-mode";
import { RootSpanResolver } from "./root-span-resolver";
import { SpanMap } from "./span-map";
import type { AdlrClient, OpenCodeEvent } from "./types";

// @opencode-ai/plugin is a peer dependency and may not be installed in the
// workspace. Declare a minimal local shape so typecheck passes while keeping the
// exported API compatible.
type Plugin = (config: unknown) => Promise<{
	event?: (args: { event: unknown }) => Promise<void> | void;
}>;

export const ObservabilityPlugin: Plugin = async () => {
	const pluginMode = resolveMode(
		process.env as Record<string, string | undefined>,
	);

	if (pluginMode.mode === "standalone") {
		return {
			event: async () => {},
		};
	}

	if (!existsSync(pluginMode.socketPath)) {
		// The daemon socket is not present. Degrade to a no-op hook rather than
		// crashing the opencode process.
		return {
			event: async () => {},
		};
	}

	let client: ReturnType<typeof createClient>;
	try {
		client = createClient(pluginMode.socketPath);
	} catch {
		// The daemon socket is not reachable. Degrade to a no-op hook rather
		// than crashing the opencode process.
		return {
			event: async () => {},
		};
	}

	const spanMap = new SpanMap();
	const rootSpanResolver = new RootSpanResolver(
		pluginMode.sessionId,
		client as AdlrClient,
		pluginMode.mode === "managed" ? pluginMode.spanId : undefined,
	);

	return {
		event: async ({ event }: { event: unknown }) => {
			try {
				await handleEvent(event as OpenCodeEvent, {
					client: client as AdlrClient,
					spanMap,
					rootResolver: rootSpanResolver,
					sessionId: pluginMode.sessionId,
				});
			} catch {
				// Plugin failures must never crash the opencode process.
			}
		},
	};
};
