"use client";
import { useCallback, useEffect, useState } from "react";
import { useStackOrNull } from "../../context/provider";
import type { InferListState, ListStateSchema } from "../../shared/list-state";
import {
	parseListStateFromSearchParams,
	resolveListStateHistoryMode,
	serializeListStateToSearchParams,
} from "../../shared/list-state";

export type {
	InferListState,
	ListStateField,
	ListStateSchema,
} from "../../shared/list-state";
export {
	listStateParamKey,
	parseListStateFromSearchParams,
	serializeListStateToSearchParams,
} from "../../shared/list-state";

export type SetListStateOptions = {
	/** Force `replace` vs `push` history semantics for this update */
	replace?: boolean;
};

export type SetListState<S extends ListStateSchema> = (
	updates:
		| Partial<InferListState<S>>
		| ((prev: InferListState<S>) => Partial<InferListState<S>>),
	options?: SetListStateOptions,
) => void;

/**
 * Sync list UI state (filters, tabs, pagination) with URL search params.
 *
 * Defaults are omitted from the URL. Field-level `history: "replace"` is used
 * for rapid changes; discrete changes (tab/page) default to `push` so the back
 * button undoes them.
 *
 * The `namespace` identifies this list state for SSR helpers; URL keys use
 * the schema field names directly.
 *
 * @example
 * ```tsx
 * const [state, setState] = useListState("comments-moderation", {
 *   tab: { type: "string", default: "pending" },
 *   page: { type: "number", default: 1 },
 * });
 * // URL: ?tab=spam&page=3
 * ```
 */
export function useListState<S extends ListStateSchema>(
	namespace: string,
	schema: S,
): [InferListState<S>, SetListState<S>] {
	const stack = useStackOrNull();
	const router = stack?.router;
	const getSearchParams = router?.getSearchParams;
	const setSearchParams = router?.setSearchParams;

	const [urlVersion, bumpUrlVersion] = useState(0);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const onPopState = () => bumpUrlVersion((v) => v + 1);
		window.addEventListener("popstate", onPopState);
		return () => window.removeEventListener("popstate", onPopState);
	}, []);

	// Read search params on every render so router-driven URL changes are picked
	// up even when `getSearchParams` is referentially stable. `urlVersion` covers
	// back/forward when the parent does not re-render.
	void urlVersion;
	const state = parseListStateFromSearchParams(
		namespace,
		schema,
		getSearchParams?.() ?? new URLSearchParams(),
	);

	const setState = useCallback<SetListState<S>>(
		(updates, options) => {
			if (!setSearchParams || !getSearchParams) return;

			const currentParams = getSearchParams();
			const currentState = parseListStateFromSearchParams(
				namespace,
				schema,
				currentParams,
			);
			const patch =
				typeof updates === "function" ? updates(currentState) : updates;
			if (!patch || Object.keys(patch).length === 0) return;

			const nextState = { ...currentState, ...patch };
			const replace = resolveListStateHistoryMode(
				schema,
				patch,
				options?.replace,
			);

			const nextParams = serializeListStateToSearchParams(
				namespace,
				schema,
				nextState,
				currentParams,
			);
			setSearchParams(nextParams, { replace });
			bumpUrlVersion((v) => v + 1);
		},
		[namespace, schema, setSearchParams, getSearchParams],
	);

	return [state, setState];
}
