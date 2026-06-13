import type {
  Session,
  Span,
  Event,
  ContextItem,
  CreateSessionInput,
  CreateSpanInput,
  CreateEventInput,
  AddContextItemInput,
  EventFilter,
  ContextFilter,
} from "./types"

export interface Storage {
  createSession(data: CreateSessionInput): Promise<Session>
  getSession(id: string): Promise<Session | null>
  listSessions(): Promise<Session[]>
  updateSession(id: string, data: Partial<Session>): Promise<void>

  createSpan(data: CreateSpanInput): Promise<Span>
  updateSpan(id: string, data: Partial<Span>): Promise<void>
  getSpan(id: string): Promise<Span | null>
  listSpans(sessionId: string): Promise<Span[]>
  listAllSpans(): Promise<Span[]>

  createEvent(data: CreateEventInput): Promise<Event>
  listEvents(sessionId: string, filter?: EventFilter): Promise<Event[]>

  addContextItem(data: AddContextItemInput): Promise<ContextItem>
  listContextItems(sessionId: string, filter?: ContextFilter): Promise<ContextItem[]>

  close(): void
}
