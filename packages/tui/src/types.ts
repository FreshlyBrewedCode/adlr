import type { ContextItem, Event, Session, Span } from "@adler/sdk";

export interface AppState {
	session: Session | null;
	spans: Span[];
	events: Event[];
	daemonEvents: Event[];
	context: ContextItem[];
}

export type AppAction =
	| { type: "setState"; payload: Partial<AppState> }
	| {
			type: "snapshot";
			payload: {
				session: Session;
				spans: Span[];
				events: Event[];
				context: ContextItem[];
			};
	  }
	| { type: "event"; payload: Event }
	| { type: "daemonSnapshot"; payload: Event[] }
	| { type: "daemonEvent"; payload: Event };

export const initialState: AppState = {
	session: null,
	spans: [],
	events: [],
	daemonEvents: [],
	context: [],
};

export function reducer(state: AppState, action: AppAction): AppState {
	switch (action.type) {
		case "setState":
			return { ...state, ...action.payload };
		case "snapshot":
			return {
				...state,
				session: action.payload.session,
				spans: action.payload.spans,
				events: action.payload.events,
				context: action.payload.context,
			};
		case "event": {
			const ev = action.payload;
			if (ev.type === "span.started") {
				const d = ev.data as {
					span_id: string;
					kind: string;
					name: string;
					parent_id?: string | null;
				};
				const newSpan: Span = {
					id: d.span_id,
					session_id: ev.session_id,
					parent_id: d.parent_id ?? null,
					kind: d.kind as Span["kind"],
					name: d.name,
					status: "running",
					started_at: ev.timestamp,
					finished_at: null,
					data: {},
				};
				return {
					...state,
					spans: [...state.spans, newSpan],
					events: [ev, ...state.events],
				};
			}
			if (ev.type === "span.finished" || ev.type === "span.failed") {
				const d = ev.data as { span_id: string };
				const newStatus = ev.type === "span.finished" ? "done" : "failed";
				return {
					...state,
					spans: state.spans.map((s) =>
						s.id === d.span_id
							? {
									...s,
									status: newStatus as Span["status"],
									finished_at: ev.timestamp,
								}
							: s,
					),
					events: [ev, ...state.events],
				};
			}
			if (ev.type === "context.added") {
				const item = ev.data as unknown as ContextItem;
				return {
					...state,
					context: [...state.context, item],
					events: [ev, ...state.events],
				};
			}
			return { ...state, events: [ev, ...state.events] };
		}
		case "daemonSnapshot":
			return { ...state, daemonEvents: action.payload };
		case "daemonEvent":
			return {
				...state,
				daemonEvents: [action.payload, ...state.daemonEvents],
			};
		default:
			return state;
	}
}
