import type { SpanUsage } from "@adlr/sdk";
import type { RootSpanResolver } from "./root-span-resolver";
import type { SpanMap } from "./span-map";
import type {
	AdlrClient,
	OpenCodeEvent,
	SessionCreatedEvent,
	SessionDeletedEvent,
	SessionIdleEvent,
	SessionUpdatedEvent,
	StepFinishPart,
	StepFinishPartUpdatedEvent,
} from "./types";

export interface PluginContext {
	client: AdlrClient;
	spanMap: SpanMap;
	rootResolver: RootSpanResolver;
	sessionId: string;
}

export async function handleEvent(
	event: OpenCodeEvent,
	ctx: PluginContext,
): Promise<void> {
	const { client, spanMap, rootResolver, sessionId } = ctx;

	switch (event.type) {
		case "session.created": {
			const evt = event as SessionCreatedEvent;
			const { id, parentID, title } = evt.properties.info;
			// Only track subagent sessions (those that have a parentID)
			if (!parentID) return;

			const rootId = await rootResolver.resolve();

			const span = await client.span.create<"agent">({
				session_id: sessionId,
				parent_id: rootId,
				kind: "agent",
				name: title ?? id,
				status: "running",
			});

			spanMap.set(id, span.id);
			return;
		}

		case "session.idle": {
			const evt = event as SessionIdleEvent;
			const { sessionID } = evt.properties;
			if (!spanMap.has(sessionID)) return;

			const spanId = spanMap.get(sessionID);
			if (spanId === undefined) return;

			await client.span.finish(spanId, "done");
			spanMap.markFinished(sessionID);
			return;
		}

		case "session.deleted": {
			const evt = event as SessionDeletedEvent;
			const { sessionID } = evt.properties;
			if (!spanMap.has(sessionID)) return;
			if (spanMap.isFinished(sessionID)) return;

			const spanId = spanMap.get(sessionID);
			if (spanId === undefined) return;

			await client.span.finish(spanId, "done");
			spanMap.markFinished(sessionID);
			return;
		}

		case "message.part.updated": {
			const evt = event as StepFinishPartUpdatedEvent;
			const { sessionID, part } = evt.properties;
			if (part.type !== "step-finish") return;

			const stepPart = part as StepFinishPart;

			const usage = {
				tokens: {
					input: stepPart.tokens.input,
					output: stepPart.tokens.output,
					cache_read: stepPart.tokens.cache?.read ?? 0,
					cache_write: stepPart.tokens.cache?.write ?? 0,
				},
				cost_usd: stepPart.cost,
			} as unknown as SpanUsage;

			const targetId = spanMap.get(sessionID) ?? (await rootResolver.resolve());

			await client.span.update(targetId, { usage }, { merge: true });
			return;
		}

		case "session.updated": {
			const evt = event as SessionUpdatedEvent;
			const { cost, tokens } = evt.properties.info;
			if (cost === undefined && tokens === undefined) return;

			const rootId = await rootResolver.resolve();

			const usageData: Record<string, unknown> = {};
			if (cost !== undefined) usageData.cost_usd = cost;
			if (tokens !== undefined) {
				usageData.tokens = {
					input: tokens.input ?? 0,
					output: tokens.output ?? 0,
					cache_read: tokens.cache?.read ?? 0,
					cache_write: tokens.cache?.write ?? 0,
				};
			}

			await client.span.update(
				rootId,
				{ usage: usageData as unknown as SpanUsage },
				{ merge: true },
			);
			return;
		}

		default:
			// Unknown event type — no-op
			return;
	}
}
