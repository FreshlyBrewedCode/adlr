import type {
	AgentSpanData,
	CreateSpanInput,
	SpanKind,
	SpanOf,
} from "@adlr/sdk";

// Minimal subset of the @adlr/sdk Client that this plugin uses.
// The real createClient() return value satisfies this interface structurally.
export interface AdlrClient {
	span: {
		create<K extends SpanKind = SpanKind>(
			input: CreateSpanInput<K>,
		): Promise<SpanOf<K>>;
		finish(id: string, status?: "done" | "failed"): Promise<void>;
		update(
			id: string,
			data: Partial<AgentSpanData>,
			options?: { merge?: boolean },
		): Promise<void>;
	};
}

// Opencode event shapes used by the plugin.
export interface SessionCreatedEvent {
	type: "session.created";
	properties: {
		info: {
			id: string;
			parentID?: string | null;
			title?: string;
		};
	};
}

export interface SessionIdleEvent {
	type: "session.idle";
	properties: { sessionID: string };
}

export interface SessionDeletedEvent {
	type: "session.deleted";
	properties: { sessionID: string };
}

export interface StepFinishPart {
	type: "step-finish";
	tokens: {
		total: number;
		input: number;
		output: number;
		reasoning?: number;
		cache?: { write: number; read: number };
	};
	cost: number;
}

export interface StepFinishPartUpdatedEvent {
	type: "message.part.updated";
	properties: {
		sessionID: string;
		part: { type: string } & Partial<StepFinishPart>;
	};
}

export interface SessionUpdatedEvent {
	type: "session.updated";
	properties: {
		info: {
			id: string;
			cost?: number;
			tokens?: {
				input?: number;
				output?: number;
				cache?: { read?: number; write?: number };
			};
		};
	};
}

export type OpenCodeEvent =
	| SessionCreatedEvent
	| SessionIdleEvent
	| SessionDeletedEvent
	| StepFinishPartUpdatedEvent
	| SessionUpdatedEvent
	| { type: string; properties: Record<string, unknown> };
