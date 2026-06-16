import type { Session, Span, Event, ContextItem } from "@adler/sdk"

export interface AppState {
  session: Session | null
  spans: Span[]
  events: Event[]
  context: ContextItem[]
}

export type AppAction =
  | { type: "setState"; payload: Partial<AppState> }
  | { type: "snapshot"; payload: { session: Session; spans: Span[]; events: Event[]; context: ContextItem[] } }
  | { type: "event"; payload: Event }

export const initialState: AppState = {
  session: null,
  spans: [],
  events: [],
  context: [],
}

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "setState":
      return { ...state, ...action.payload }
    case "snapshot":
      return {
        ...state,
        session: action.payload.session,
        spans: action.payload.spans,
        events: action.payload.events,
        context: action.payload.context,
      }
    case "event":
      return { ...state, events: [action.payload, ...state.events] }
    default:
      return state
  }
}
