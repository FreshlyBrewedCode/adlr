import type { Span } from "@adlr/sdk";
import { createClient } from "@adlr/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";
import { AdlrCliError } from "../../error";
import { resolveSessionId } from "../../resolve-session";

function formatDuration(started: number, finished: number | null): string {
	const ms = (finished ?? Date.now()) - started;
	if (ms < 1000) return `${ms}ms`;
	return `${Math.floor(ms / 1000)}s`;
}

function buildChildrenMap(spans: Span[]): Map<string | null, Span[]> {
	const map = new Map<string | null, Span[]>();
	for (const span of spans) {
		const list = map.get(span.parent_id) ?? [];
		list.push(span);
		map.set(span.parent_id, list);
	}
	for (const list of map.values()) {
		list.sort((a, b) => a.started_at - b.started_at);
	}
	return map;
}

function printTree(
	spans: Span[],
	childrenMap: Map<string | null, Span[]>,
	parentId: string | null,
	depth: number,
	json: boolean,
): void {
	const children = childrenMap.get(parentId) ?? [];
	for (const span of children) {
		const indent = "  ".repeat(depth);
		const prefix = depth === 0 ? "" : `${indent}└─ `;
		const duration = formatDuration(span.started_at, span.finished_at);
		const parentInfo = span.parent_id
			? ` (parent: ${span.parent_id.slice(0, 8)})`
			: "";
		if (json) {
			console.log(JSON.stringify(span));
		} else {
			console.log(
				`${prefix}${span.id.slice(0, 8)} [${span.status}] ${span.name} (${span.kind}) ${duration}${parentInfo}`,
			);
		}
		printTree(spans, childrenMap, span.id, depth + 1, json);
	}
}

export const spanListCmd = new Command("list")
	.description("List all spans for the current session as a tree")
	.option("--json", "Output as JSON (one span per line)")
	.action(async (options: { json?: boolean }) => {
		await ensureDaemon();
		const client = createClient();
		try {
			const sessionId = resolveSessionId({
				session: spanListCmd.optsWithGlobals().session,
			});
			if (!sessionId) {
				throw new AdlrCliError("No active session. Run `adlr new` first.");
			}
			const spans = await client.span.list(sessionId);
			const childrenMap = buildChildrenMap(spans);
			printTree(spans, childrenMap, null, 0, options.json ?? false);
		} finally {
			client.close();
		}
	});
