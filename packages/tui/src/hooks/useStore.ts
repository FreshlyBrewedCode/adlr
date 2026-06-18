import { useReducer } from "react";
import { initialState, reducer } from "../types";

export function useStore() {
	return useReducer(reducer, initialState);
}
