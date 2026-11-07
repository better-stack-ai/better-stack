"use client";

import { useListState } from "@btst/stack/client/hooks";
import { useDebounce } from "@btst/stack/plugins/client/hooks";
import { useSearch } from "./use-search";
import { SEARCH_PLUGIN_ID } from "../constants";
import {
	SEARCH_LIST_STATE_SCHEMA,
	type SearchListState,
} from "../search-state";

export function useSearchState({
	sources,
	initialSearch,
	enabled = true,
}: {
	sources?: readonly string[];
	initialSearch?: SearchListState;
	enabled?: boolean;
} = {}) {
	const [urlState, setState] = useListState(
		SEARCH_PLUGIN_ID,
		SEARCH_LIST_STATE_SCHEMA,
	);
	const state =
		typeof window === "undefined" && initialSearch ? initialSearch : urlState;
	const q = useDebounce(state.q, 300);
	const fixedSources = sources !== undefined;
	const selectedSources =
		sources ?? (state.sources ? state.sources.split(",") : undefined);
	const result = useSearch(
		{ q, sources: selectedSources, page: state.page, limit: 20 },
		enabled && (!fixedSources || sources.length > 0),
	);
	return {
		state,
		setState,
		fixedSources,
		result:
			fixedSources && sources.length === 0
				? { ...result, data: undefined }
				: result,
		loading: result.isLoading || (enabled && q !== state.q),
	};
}
