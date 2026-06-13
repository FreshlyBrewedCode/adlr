import { Database } from "bun:sqlite"
import type { Storage } from "./storage"
import type {
  Session,
  SessionStatus,
  Span,
  SpanKind,
  SpanStatus,
  Event,
  EventType,
  ContextItem,
  ContextItemType,
  CreateSessionInput,
  CreateSpanInput,
  CreateEventInput,
  AddContextItemInput,
  EventFilter,
  ContextFilter,
} from "./types"

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  working_dir TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spans (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  parent_id TEXT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES spans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  span_id TEXT,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (span_id) REFERENCES spans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS context_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT,
  description TEXT,
  value TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
`

function uuid(): string {
  return crypto.randomUUID()
}

export class SQLiteStorage implements Storage {
  private db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec("PRAGMA foreign_keys = ON")
    this.db.exec(INIT_SQL)
  }

  createSession(data: CreateSessionInput): Promise<Session> {
    const id = uuid()
    const now = Date.now()
    const session: Session = {
      id,
      status: data.status ?? "active",
      working_dir: data.working_dir,
      created_at: now,
    }
    this.db.run(
      "INSERT INTO sessions (id, status, working_dir, created_at) VALUES (?, ?, ?, ?)",
      [session.id, session.status, session.working_dir, session.created_at]
    )
    return Promise.resolve(session)
  }

  getSession(id: string): Promise<Session | null> {
    const row = this.db.query("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | null
    if (!row) return Promise.resolve(null)
    return Promise.resolve({
      id: String(row.id),
      status: String(row.status) as SessionStatus,
      working_dir: String(row.working_dir),
      created_at: Number(row.created_at),
    })
  }

  listSessions(): Promise<Session[]> {
    const rows = this.db.query("SELECT * FROM sessions ORDER BY created_at DESC").all() as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      id: String(r.id),
      status: String(r.status) as SessionStatus,
      working_dir: String(r.working_dir),
      created_at: Number(r.created_at),
    })))
  }

  updateSession(id: string, data: Partial<Session>): Promise<void> {
    const fields: string[] = []
    const values: unknown[] = []
    if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status) }
    if (data.working_dir !== undefined) { fields.push("working_dir = ?"); values.push(data.working_dir) }
    if (fields.length === 0) return Promise.resolve()
    values.push(id)
    this.db.run(`UPDATE sessions SET ${fields.join(", ")} WHERE id = ?`, values)
    return Promise.resolve()
  }

  createSpan(data: CreateSpanInput): Promise<Span> {
    const id = uuid()
    const now = Date.now()
    const span: Span = {
      id,
      session_id: data.session_id,
      parent_id: data.parent_id ?? null,
      kind: data.kind,
      name: data.name,
      status: data.status ?? "pending",
      started_at: now,
      finished_at: null,
      data: data.data ?? {},
    }
    this.db.run(
      "INSERT INTO spans (id, session_id, parent_id, kind, name, status, started_at, finished_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [span.id, span.session_id, span.parent_id, span.kind, span.name, span.status, span.started_at, span.finished_at, JSON.stringify(span.data)]
    )
    return Promise.resolve(span)
  }

  updateSpan(id: string, data: Partial<Span>): Promise<void> {
    const existing = this.db.query("SELECT * FROM spans WHERE id = ?").get(id) as Record<string, unknown> | null
    if (!existing) return Promise.resolve()
    const fields: string[] = []
    const values: unknown[] = []
    if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status) }
    if (data.finished_at !== undefined) { fields.push("finished_at = ?"); values.push(data.finished_at) }
    if (data.data !== undefined) { fields.push("data = ?"); values.push(JSON.stringify(data.data)) }
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name) }
    if (fields.length === 0) return Promise.resolve()
    values.push(id)
    this.db.run(`UPDATE spans SET ${fields.join(", ")} WHERE id = ?`, values)
    return Promise.resolve()
  }

  getSpan(id: string): Promise<Span | null> {
    const row = this.db.query("SELECT * FROM spans WHERE id = ?").get(id) as Record<string, unknown> | null
    if (!row) return Promise.resolve(null)
    return Promise.resolve({
      id: String(row.id),
      session_id: String(row.session_id),
      parent_id: row.parent_id != null ? String(row.parent_id) : null,
      kind: String(row.kind) as SpanKind,
      name: String(row.name),
      status: String(row.status) as SpanStatus,
      started_at: Number(row.started_at),
      finished_at: row.finished_at != null ? Number(row.finished_at) : null,
      data: JSON.parse(String(row.data)),
    })
  }

  listSpans(sessionId: string): Promise<Span[]> {
    const rows = this.db.query("SELECT * FROM spans WHERE session_id = ? ORDER BY started_at ASC").all(sessionId) as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      id: String(r.id),
      session_id: String(r.session_id),
      parent_id: r.parent_id != null ? String(r.parent_id) : null,
      kind: String(r.kind) as SpanKind,
      name: String(r.name),
      status: String(r.status) as SpanStatus,
      started_at: Number(r.started_at),
      finished_at: r.finished_at != null ? Number(r.finished_at) : null,
      data: JSON.parse(String(r.data)),
    })))
  }

  listAllSpans(): Promise<Span[]> {
    const rows = this.db.query("SELECT * FROM spans ORDER BY started_at ASC").all() as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      id: String(r.id),
      session_id: String(r.session_id),
      parent_id: r.parent_id != null ? String(r.parent_id) : null,
      kind: String(r.kind) as SpanKind,
      name: String(r.name),
      status: String(r.status) as SpanStatus,
      started_at: Number(r.started_at),
      finished_at: r.finished_at != null ? Number(r.finished_at) : null,
      data: JSON.parse(String(r.data)),
    })))
  }

  createEvent(data: CreateEventInput): Promise<Event> {
    const now = data.timestamp ?? Date.now()
    const id = this.db.run(
      "INSERT INTO events (session_id, span_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)",
      [data.session_id, data.span_id ?? null, data.type, JSON.stringify(data.data ?? {}), now]
    ).lastInsertRowId
    const event: Event = {
      id: Number(id),
      session_id: data.session_id,
      span_id: data.span_id ?? null,
      type: data.type,
      data: data.data ?? {},
      timestamp: now,
    }
    return Promise.resolve(event)
  }

  listEvents(sessionId: string, filter?: EventFilter): Promise<Event[]> {
    const conditions = ["session_id = ?"]
    const values: unknown[] = [sessionId]
    if (filter?.type !== undefined) { conditions.push("type = ?"); values.push(filter.type) }
    if (filter?.span_id !== undefined) { conditions.push("span_id = ?"); values.push(filter.span_id) }
    const sql = `SELECT * FROM events WHERE ${conditions.join(" AND ")} ORDER BY timestamp DESC`
    const rows = this.db.query(sql).all(...values) as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      id: Number(r.id),
      session_id: String(r.session_id),
      span_id: r.span_id != null ? String(r.span_id) : null,
      type: String(r.type) as EventType,
      data: JSON.parse(String(r.data)),
      timestamp: Number(r.timestamp),
    })))
  }

  addContextItem(data: AddContextItemInput): Promise<ContextItem> {
    const id = uuid()
    const now = Date.now()
    const item: ContextItem = {
      id,
      session_id: data.session_id,
      type: data.type,
      label: data.label ?? null,
      description: data.description ?? null,
      value: data.value,
      created_at: now,
    }
    this.db.run(
      "INSERT INTO context_items (id, session_id, type, label, description, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [item.id, item.session_id, item.type, item.label, item.description, JSON.stringify(item.value), item.created_at]
    )
    return Promise.resolve(item)
  }

  listContextItems(sessionId: string, filter?: ContextFilter): Promise<ContextItem[]> {
    const conditions = ["session_id = ?"]
    const values: unknown[] = [sessionId]
    if (filter?.type !== undefined) { conditions.push("type = ?"); values.push(filter.type) }
    if (filter?.label !== undefined) { conditions.push("label = ?"); values.push(filter.label) }
    const sql = `SELECT * FROM context_items WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`
    const rows = this.db.query(sql).all(...values) as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      id: String(r.id),
      session_id: String(r.session_id),
      type: String(r.type) as ContextItemType,
      label: r.label != null ? String(r.label) : null,
      description: r.description != null ? String(r.description) : null,
      value: JSON.parse(String(r.value)),
      created_at: Number(r.created_at),
    })))
  }

  close(): void {
    this.db.close()
  }
}
