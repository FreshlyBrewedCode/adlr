export type PluginMode =
	| { mode: "managed"; spanId: string; sessionId: string; socketPath: string }
	| { mode: "session-attached"; sessionId: string; socketPath: string }
	| { mode: "standalone" };

export function resolveMode(
	env: Record<string, string | undefined>,
): PluginMode {
	const socketPath = env.ADLR_SOCKET;
	const sessionId = env.ADLR_SESSION;
	const spanId = env.ADLR_SPAN_ID;
	if (spanId) {
		return {
			mode: "managed",
			spanId,
			sessionId: sessionId ?? "",
			socketPath: socketPath ?? "",
		};
	}
	if (socketPath && sessionId)
		return { mode: "session-attached", sessionId, socketPath };
	return { mode: "standalone" };
}
