import { Database } from "bun:sqlite"
import type { Storage } from "./storage"
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
    return Promise.resolve(row as Session)
  }

  listSessions(): Promise<Session[]> {
    const rows = this.db.query("SELECT * FROM sessions ORDER BY created_at DESC").all() as Record<string, unknown>[]
    return Promise.resolve(rows as Session[])
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
      ...row,
      data: JSON.parse((row.data as string) ?? "{}"),
    } as Span)
  }

  listSpans(sessionId: string): Promise<Span[]> {
    const rows = this.db.query("SELECT * FROM spans WHERE session_id = ? ORDER BY started_at ASC").all(sessionId) as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      ...r,
      data: JSON.parse((r.data as string) ?? "{}"),
    })) as Span[])
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
    if (filter?.type) { conditions.push("type = ?"); values.push(filter.type) }
    if (filter?.span_id) { conditions.push("span_id = ?"); values.push(filter.span_id) }
    const sql = `SELECT * FROM events WHERE ${conditions.join(" AND ")} ORDER BY timestamp DESC`
    const rows = this.db.query(sql).all(...values) as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      ...r,
      data: JSON.parse((r.data as string) ?? "{}"),
    })) as Event[])
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
    if (filter?.type) { conditions.push("type = ?"); values.push(filter.type) }
    if (filter?.label) { conditions.push("label = ?"); values.push(filter.label) }
    const sql = `SELECT * FROM context_items WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`
    const rows = this.db.query(sql).all(...values) as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      ...r,
      value: JSON.parse((r.value as string) ?? "{}"),
    })) as ContextItem[])
  }

  close(): void {
    this.db.close()
  }
}
