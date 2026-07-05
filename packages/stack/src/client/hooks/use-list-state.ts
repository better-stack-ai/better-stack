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

interface PendingUpdate {
	namespace: string;
	schema: ListStateSchema;
	patch: Record<string, unknown>;
	explicitReplace: boolean | undefined;
	getSearchParams: () => URLSearchParams;
	setSearchParams: (
		next: URLSearchParams,
		opts?: { replace?: boolean },
	) => void;
	onFlushed: () => void;
}

// Same-tick updates from ALL useListState instances are coalesced into one
// `setSearchParams` call. Router bindings commit URL changes asynchronously
// (Next.js `router.push`, React Router `navigate`), so a second update in the
// same event would read a stale URL and drop what the first one wrote — and
// each call would add its own history entry, breaking
// one-back-press-undoes-one-action semantics. The URL is a per-window
// singleton, so a module-level queue is the correct batching scope; `setState`
// only runs in client event handlers, never during SSR.
let pendingQueue: PendingUpdate[] | null = null;

function searchParamsEqual(a: URLSearchParams, b: URLSearchParams): boolean {
	const sorted = (params: URLSearchParams) => {
		const copy = new URLSearchParams(params.toString());
		copy.sort();
		return copy.toString();
	};
	return sorted(a) === sorted(b);
}

function enqueueListStateUpdate(update: PendingUpdate): void {
	if (pendingQueue) {
		pendingQueue.push(update);
		return;
	}

	pendingQueue = [update];
	queueMicrotask(() => {
		const queue = pendingQueue;
		pendingQueue = null;
		if (!queue || queue.length === 0) return;

		const first = queue[0]!;
		const currentParams = first.getSearchParams();

		let params = currentParams;
		let replace = true;
		let changed = false;
		for (const entry of queue) {
			const prevState = parseListStateFromSearchParams(
				entry.namespace,
				entry.schema,
				params,
			);
			const nextState = { ...prevState, ...entry.patch };
			// Compare parsed states, not serialized strings: the URL may hold an
			// explicit default (`?tab=pending`) or differ only in param order, and
			// such state-identical updates must not touch history.
			if (
				Object.keys(entry.schema).every((key) =>
					Object.is(prevState[key], nextState[key]),
				)
			) {
				continue;
			}
			changed = true;
			params = serializeListStateToSearchParams(
				entry.namespace,
				entry.schema,
				nextState as InferListState<ListStateSchema>,
				params,
			);
			// A single push among the batched updates makes the whole flush a
			// push, so the combined action stays one back-press away.
			if (
				!resolveListStateHistoryMode(
					entry.schema,
					entry.patch as Partial<InferListState<ListStateSchema>>,
					entry.explicitReplace,
				)
			) {
				replace = false;
			}
		}

		// Also skip when later entries reverted earlier ones back to the URL's
		// current state (net no-op across the batch). Compare order-insensitively:
		// serialization may reorder params without changing state.
		if (!changed || searchParamsEqual(params, currentParams)) return;
		first.setSearchParams(params, { replace });
		for (const entry of queue) entry.onFlushed();
	});
}

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

			// Base state = URL state + patches already queued this tick, so
			// functional updaters see the values earlier calls just set.
			let baseState = parseListStateFromSearchParams(
				namespace,
				schema,
				getSearchParams(),
			);
			if (pendingQueue) {
				for (const entry of pendingQueue) {
					if (entry.namespace === namespace) {
						baseState = { ...baseState, ...entry.patch };
					}
				}
			}
			const patch =
				typeof updates === "function" ? updates(baseState) : updates;
			if (!patch || Object.keys(patch).length === 0) return;

			enqueueListStateUpdate({
				namespace,
				schema,
				patch: { ...patch },
				explicitReplace: options?.replace,
				getSearchParams,
				setSearchParams,
				onFlushed: () => bumpUrlVersion((v) => v + 1),
			});
		},
		[namespace, schema, setSearchParams, getSearchParams],
	);

	return [state, setState];
}
