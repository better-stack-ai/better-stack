import {
	parseListStateFromSearchParams,
	type ListStateSchema,
} from "@btst/stack/client";
import { SEARCH_PLUGIN_ID } from "./constants";

export const SEARCH_LIST_STATE_SCHEMA = {
	q: { type: "string", default: "", history: "replace" },
	sources: { type: "string", default: "" },
	page: { type: "number", default: 1 },
} as const satisfies ListStateSchema;

export function parseSearchState(searchParams: URLSearchParams | string = "") {
	return parseListStateFromSearchParams(
		SEARCH_PLUGIN_ID,
		SEARCH_LIST_STATE_SCHEMA,
		searchParams,
	);
}

export type SearchListState = ReturnType<typeof parseSearchState>;
