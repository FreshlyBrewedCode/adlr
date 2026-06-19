export type SessionStatus = "active" | "completed" | "archived";

export interface Session {
	id: string;
	status: SessionStatus;
	working_dir: string;
	created_at: number;
}

export type CreateSessionInput = {
	status?: SessionStatus;
	working_dir: string;
};

export type SpanKind = "agent" | "workflow" | "step" | "hook";
export type SpanStatus = "pending" | "running" | "done" | "failed" | "blocked";

export interface SpanUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
}

export interface AgentSpanData {
	prompt?: string;
	agent_type?: string;
	output?: { type: "text"; content: string } | { type: "file"; path: string };
	usage?: SpanUsage;
	pid?: number | null;
	exit_code?: number | null;
}

export interface SpanDataMap {
	agent: AgentSpanData;
	workflow: Record<string, unknown>;
	step: Record<string, unknown>;
	hook: Record<string, unknown>;
}

export interface BaseSpan<K extends SpanKind = SpanKind> {
	id: string;
	session_id: string;
	parent_id: string | null;
	kind: K;
	name: string;
	status: SpanStatus;
	started_at: number;
	finished_at: number | null;
}

export type SpanOf<K extends SpanKind> = BaseSpan<K> & { data: SpanDataMap[K] };

export type AgentSpan = SpanOf<"agent">;

export type Span = SpanOf<SpanKind>;

export type CreateSpanInput<K extends SpanKind = SpanKind> = {
	session_id: string;
	parent_id?: string | null;
	kind: K;
	name: string;
	status?: SpanStatus;
	data?: SpanDataMap[K];
};

export type EventType =
	| "span.created"
	| "span.started"
	| "span.finished"
	| "span.failed"
	| "log.info"
	| "log.warn"
	| "log.error"
	| "context.added"
	| "session.created";

export interface Event {
	id: number;
	session_id: string;
	span_id: string | null;
	type: EventType;
	data: Record<string, unknown>;
	timestamp: number;
}

export type CreateEventInput = {
	session_id: string;
	span_id?: string | null;
	type: EventType;
	data?: Record<string, unknown>;
	timestamp?: number;
};

export type ContextItemType = "goal" | "url" | "file" | "text";

export interface ContextItem {
	id: string;
	session_id: string;
	type: ContextItemType;
	label: string | null;
	description: string | null;
	value: Record<string, unknown>;
	created_at: number;
}

export type AddContextItemInput = {
	session_id: string;
	type: ContextItemType;
	label?: string | null;
	description?: string | null;
	value: Record<string, unknown>;
};

export type EventFilter = {
	type?: EventType;
	span_id?: string;
};

export type ContextFilter = {
	type?: ContextItemType;
	label?: string;
};

export type ContentNode = LayoutNode | PanelNode | string;

export interface LayoutNode {
	layout: string;
	content: ContentNode[];
	[key: string]: unknown;
}

export interface PanelNode {
	panel: string;
}

export interface TuiConfig {
	layout?: LayoutNode;
}

export interface AdlrConfig {
	agent?: {
		agents?: Record<string, AgentConfig>;
		attach?: AttachConfig;
	};
	tui?: TuiConfig;
}

export interface AgentConfig {
	run?: (ctx: { prompt: string; subagent?: string }) => string;
	open?: (ctx: { span: AgentSpan; proc: ProcContext; $: unknown }) => string;
	output?: (ctx: {
		span: AgentSpan;
		proc: ProcContext;
		$: unknown;
	}) => Promise<
		{ type: "text"; content: string } | { type: "file"; path: string }
	>;
	status?: (ctx: {
		span: AgentSpan;
		currentStatus: SpanStatus;
		proc: ProcContext;
		$: unknown;
	}) => Promise<"working" | "completed" | "failed" | "blocked">;
	statusPollInterval?: number;
	mode?: "tui" | "log";
	interactive?: boolean;
	interactiveTimeout?: number;
}

export interface ProcContext {
	stdoutIdle: boolean;
	lastStdout: string;
}

export type AttachConfig = (ctx: {
	agentId: string;
	readCmd: string;
	openCmd?: string;
}) => string;
