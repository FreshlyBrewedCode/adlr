import type {
	ContextItemType,
	CreateSpanInput,
	SessionStatus,
	Span,
	Storage,
} from "@adlr/sdk";
import { DAEMON_SESSION_ID } from "@adlr/sdk";
import type { ProcessManager } from "./process-manager";

export interface HandlerContext {
	storage: Storage;
	processManager: ProcessManager;
	subscribers: Map<string, Set<{ write: (data: string) => void }>>;
	broadcast: (
		sessionId: string,
		event: { type: string; payload: unknown },
	) => void;
}

export async function handleCommand(
	ctx: HandlerContext,
	type: string,
	payload: unknown,
): Promise<unknown> {
	switch (type) {
		case "session.create": {
			const data = payload as { working_dir?: string; status?: string };
			const status = (
				["active", "completed", "archived"] as SessionStatus[]
			).includes(data.status as SessionStatus)
				? (data.status as SessionStatus)
				: undefined;
			const session = await ctx.storage.createSession({
				working_dir: data.working_dir ?? process.cwd(),
				status,
			});
			ctx.broadcast(session.id, {
				type: "session.created",
				payload: { session_id: session.id },
			});
			return session;
		}

		case "session.list": {
			const sessions = await ctx.storage.listSessions();
			return sessions.filter((s) => s.id !== DAEMON_SESSION_ID);
		}

		case "session.get": {
			const { id } = payload as { id: string };
			return ctx.storage.getSession(id);
		}

		case "agent.run": {
			const data = payload as {
				session_id: string;
				agent_type: string;
				prompt: string;
				name: string;
				parent_span_id?: string | null;
			};
			const span = await ctx.processManager.spawnAgent({
				sessionId: data.session_id,
				agentType: data.agent_type,
				prompt: data.prompt,
				name: data.name,
				parentSpanId: data.parent_span_id,
			});
			return span;
		}

		case "agent.wait": {
			const { name, id } = payload as { name?: string; id?: string };
			if (!name && !id) throw new Error("Either name or id must be provided");
			let span: Span | undefined;
			if (id) {
				span = (await ctx.storage.getSpan(id)) ?? undefined;
			} else {
				const spans = await ctx.storage.listAllSpans();
				span = spans.find((s) => s.name === name);
			}
			if (!span)
				throw new Error(
					id ? `Agent not found: ${id}` : `Agent not found: ${name}`,
				);
			const maxWaitMs = 5 * 60 * 1000; // 5 minutes
			const start = Date.now();
			while (true) {
				const current = await ctx.storage.getSpan(span.id);
				if (!current) throw new Error("Span disappeared");
				if (
					current.status === "done" ||
					current.status === "failed" ||
					current.status === "blocked"
				) {
					return current;
				}
				if (Date.now() - start > maxWaitMs) {
					throw new Error(
						`Agent ${id ?? name} did not complete within 5 minutes`,
					);
				}
				await new Promise((r) => setTimeout(r, 500));
			}
			break;
		}

		case "agent.status": {
			const { name, id } = payload as { name?: string; id?: string };
			if (!name && !id) throw new Error("Either name or id must be provided");
			let span: Span | undefined | null;
			if (id) {
				span = await ctx.storage.getSpan(id);
			} else {
				const spans = await ctx.storage.listAllSpans();
				span = spans.find((s) => s.name === name);
			}
			if (!span)
				throw new Error(
					id ? `Agent not found: ${id}` : `Agent not found: ${name}`,
				);
			return span.status;
		}

		case "agent.list": {
			const { session_id } = payload as { session_id: string };
			const spans = await ctx.storage.listSpans(session_id);
			return spans.filter((s) => s.kind === "agent");
		}

		case "agent.attach": {
			const { span_id } = payload as { span_id: string };
			return { span_id, message: "Use raw socket for attach" };
		}

		case "span.get": {
			const { id } = payload as { id: string };
			const span = await ctx.storage.getSpan(id);
			if (!span) throw new Error(`Span not found: ${id}`);
			return span;
		}

		case "span.list": {
			const { session_id } = payload as { session_id: string };
			return ctx.storage.listSpans(session_id);
		}

		case "span.update": {
			const { id, data, options } = payload as {
				id: string;
				data: Record<string, unknown>;
				options?: { merge?: boolean };
			};
			const existing = await ctx.storage.getSpan(id);
			if (!existing) throw new Error(`Span not found: ${id}`);
			const updatedData = options?.merge ? { ...existing.data, ...data } : data;
			await ctx.storage.updateSpan(id, { data: updatedData });
			return { success: true };
		}

		case "span.create": {
			const data = payload as CreateSpanInput;
			const span = await ctx.storage.createSpan(data);
			ctx.broadcast(span.session_id, {
				type: "span.created",
				payload: {
					session_id: span.session_id,
					span_id: span.id,
					kind: span.kind,
					name: span.name,
					parent_id: span.parent_id,
				},
			});
			return span;
		}

		case "span.finish": {
			const { id, data } = payload as {
				id: string;
				data?: Record<string, unknown>;
			};
			const existing = await ctx.storage.getSpan(id);
			if (!existing) throw new Error(`Span not found: ${id}`);
			const updatedData = data ? { ...existing.data, ...data } : existing.data;
			await ctx.storage.updateSpan(id, {
				status: "done",
				finished_at: Date.now(),
				data: updatedData,
			});
			ctx.broadcast(existing.session_id, {
				type: "span.finished",
				payload: { session_id: existing.session_id, span_id: id },
			});
			return { success: true };
		}

		case "context.add": {
			const data = payload as {
				session_id: string;
				type: string;
				label?: string;
				description?: string;
				value: Record<string, unknown>;
			};
			const validTypes = ["goal", "url", "file", "text"] as ContextItemType[];
			const type = validTypes.includes(data.type as ContextItemType)
				? (data.type as ContextItemType)
				: "text";
			const item = await ctx.storage.addContextItem({
				session_id: data.session_id,
				type,
				label: data.label ?? null,
				description: data.description ?? null,
				value: data.value,
			});
			ctx.broadcast(data.session_id, { type: "context.added", payload: item });
			return item;
		}

		case "context.list": {
			const { session_id } = payload as { session_id: string };
			return ctx.storage.listContextItems(session_id);
		}

		case "subscribe": {
			const { session_id } = payload as { session_id: string };
			const session = await ctx.storage.getSession(session_id);
			if (!session) throw new Error(`Session not found: ${session_id}`);
			const spans = await ctx.storage.listSpans(session_id);
			const events = await ctx.storage.listEvents(session_id);
			const context = await ctx.storage.listContextItems(session_id);
			return {
				type: "snapshot",
				payload: { session, spans, events, context },
			};
		}

		default:
			throw new Error(`Unknown command: ${type}`);
	}
}
