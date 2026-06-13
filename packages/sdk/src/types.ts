export type SessionStatus = "active" | "completed" | "archived"

export interface Session {
  id: string
  status: SessionStatus
  working_dir: string
  created_at: number
}

export type CreateSessionInput = {
  status?: SessionStatus
  working_dir: string
}

export type SpanKind = "agent" | "workflow" | "step" | "hook"
export type SpanStatus = "pending" | "running" | "done" | "failed" | "blocked"

export interface Span {
  id: string
  session_id: string
  parent_id: string | null
  kind: SpanKind
  name: string
  status: SpanStatus
  started_at: number
  finished_at: number | null
  data: Record<string, unknown>
}

export type CreateSpanInput = {
  session_id: string
  parent_id?: string | null
  kind: SpanKind
  name: string
  status?: SpanStatus
  data?: Record<string, unknown>
}

export type EventType =
  | "span.started"
  | "span.finished"
  | "span.failed"
  | "log.info"
  | "log.warn"
  | "log.error"
  | "context.added"
  | "session.created"

export interface Event {
  id: number
  session_id: string
  span_id: string | null
  type: EventType
  data: Record<string, unknown>
  timestamp: number
}

export type CreateEventInput = {
  session_id: string
  span_id?: string | null
  type: EventType
  data?: Record<string, unknown>
  timestamp?: number
}

export type ContextItemType = "goal" | "url" | "file" | "text"

export interface ContextItem {
  id: string
  session_id: string
  type: ContextItemType
  label: string | null
  description: string | null
  value: Record<string, unknown>
  created_at: number
}

export type AddContextItemInput = {
  session_id: string
  type: ContextItemType
  label?: string | null
  description?: string | null
  value: Record<string, unknown>
}

export type EventFilter = {
  type?: EventType
  span_id?: string
}

export type ContextFilter = {
  type?: ContextItemType
  label?: string
}

export interface AdlerConfig {
  agent?: {
    agents?: Record<string, AgentConfig>
    attach?: AttachConfig
  }
}

export interface AgentConfig {
  run?: (ctx: { prompt: string; subagent?: string }) => string
  open?: (ctx: { span: Span; proc: ProcContext; $: unknown }) => string
  output?: (ctx: { span: Span; proc: ProcContext; $: unknown }) => Promise<{ type: "text"; content: string } | { type: "file"; path: string }>
  status?: (ctx: { span: Span; currentStatus: SpanStatus; proc: ProcContext; $: unknown }) => Promise<"working" | "completed" | "failed" | "blocked">
  statusPollInterval?: number
  mode?: "tui" | "log"
  interactive?: boolean
  interactiveTimeout?: number
}

export interface ProcContext {
  stdoutIdle: boolean
  lastStdout: string
}

export interface AttachConfig {
  (ctx: { agentId: string; readCmd: string; openCmd?: string }): string
}
