"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SHARED_QUERY_CONFIG } from "./errors";
import { buildQueryKey, runResourceQuery, type ResourceDef } from "./queries";
import { useResourceContext } from "./internal";
import { useDebounce } from "./use-debounce";

/** An option produced by the per-resource `useSelect` hook. */
export interface ResourceSelectOption<TItem> {
	value: string;
	label: string;
	/** The underlying record; undefined for values that could not be resolved */
	item?: TItem;
}

/** Configuration for the per-resource `useSelect` hook. */
export interface ResourceSelectConfig<TItem> {
	/**
	 * Query used to fetch options (default `"list"`). Must be a non-infinite
	 * query whose data is an array of records.
	 */
	query?: string;
	/** Maps the (debounced) search text to the option-query args */
	searchArgs: (search: string) => readonly unknown[];
	getOptionValue: (item: TItem) => string;
	getOptionLabel: (item: TItem) => string;
	/** Currently selected value(s) — preloaded when missing from options */
	value?: string | string[];
	/**
	 * Query used to preload selected values missing from the options
	 * (default query `"detail"`). Preloading is skipped when omitted.
	 */
	preload?: {
		query?: string;
		args: (value: string) => readonly unknown[];
	};
	/** Debounce for the search text in milliseconds (default 300) */
	debounceMs?: number;
	enabled?: boolean;
}

/** Result of the per-resource `useSelect` hook. */
export interface ResourceSelectResult<TItem> {
	/** Search results plus preloaded selected records */
	options: ResourceSelectOption<TItem>[];
	/** Options for the current `value(s)`, resolved where possible */
	selectedOptions: ResourceSelectOption<TItem>[];
	search: string;
	setSearch: (search: string) => void;
	/** Initial load of options or preloaded values in flight */
	isLoading: boolean;
	/** Search debounce pending or a search fetch in flight */
	isSearching: boolean;
	error: Error | null;
}

/**
 * Builds the per-resource `useSelect` hook: debounced server-side search,
 * current-value preloading, and loading states for relation pickers.
 */
export function createUseSelect(
	plugin: string,
	resourceName: string,
	resource: ResourceDef,
) {
	return function useSelect<TItem>(
		config: ResourceSelectConfig<TItem>,
	): ResourceSelectResult<TItem> {
		const context = useResourceContext(plugin);
		const enabled = config.enabled ?? true;

		// --- search ------------------------------------------------------------
		const [search, setSearch] = useState("");
		const debouncedSearch = useDebounce(search, config.debounceMs ?? 300);

		const listName = config.query ?? "list";
		const listDef = resource.queries[listName];
		if (!listDef) {
			throw new Error(
				`Resource "${resourceName}" has no "${listName}" query declared`,
			);
		}
		if (listDef.infinite) {
			throw new Error(
				`useSelect requires a non-infinite query, but "${resourceName}.${listName}" is declared infinite`,
			);
		}

		const listArgs = config.searchArgs(debouncedSearch);
		const listQuery = useQuery<unknown, Error>({
			queryKey: buildQueryKey(resourceName, listName, listDef, listArgs),
			queryFn: () =>
				runResourceQuery(
					context.client,
					listDef,
					listArgs,
					undefined,
					context.headers,
				),
			...SHARED_QUERY_CONFIG,
			enabled,
		});

		const items = (listQuery.data as TItem[] | null | undefined) ?? [];

		// --- current-value preloading -------------------------------------------
		const values =
			config.value === undefined
				? []
				: Array.isArray(config.value)
					? config.value
					: [config.value];

		const { getOptionValue, getOptionLabel } = config;
		const fetchedValues = new Set(items.map((item) => getOptionValue(item)));
		const preloadName = config.preload?.query ?? "detail";
		const preloadDef = config.preload
			? resource.queries[preloadName]
			: undefined;
		// Wait for the initial options load before preloading, so values that
		// are part of the regular options don't trigger a redundant fetch.
		const missingValues =
			preloadDef && enabled && !listQuery.isLoading
				? values.filter((value) => !fetchedValues.has(value))
				: [];

		const preloadQueries = useQueries({
			queries: missingValues.map((value) => {
				const args = (
					config.preload as NonNullable<typeof config.preload>
				).args(value);
				return {
					queryKey: buildQueryKey(
						resourceName,
						preloadName,
						preloadDef as NonNullable<typeof preloadDef>,
						args,
					),
					queryFn: () =>
						runResourceQuery(
							context.client,
							preloadDef as NonNullable<typeof preloadDef>,
							args,
							undefined,
							context.headers,
						),
					...SHARED_QUERY_CONFIG,
				};
			}),
		});

		const preloadedItems = preloadQueries
			.map((query) => query.data as TItem | null | undefined)
			.filter((item): item is TItem => item !== null && item !== undefined);

		// --- options -------------------------------------------------------------
		const toOption = (item: TItem): ResourceSelectOption<TItem> => ({
			value: getOptionValue(item),
			label: getOptionLabel(item),
			item,
		});

		const options: ResourceSelectOption<TItem>[] = items.map(toOption);
		const seen = new Set(options.map((option) => option.value));
		for (const item of preloadedItems) {
			const option = toOption(item);
			if (!seen.has(option.value)) {
				seen.add(option.value);
				options.push(option);
			}
		}

		const selectedOptions = values.map(
			(value) =>
				options.find((option) => option.value === value) ?? {
					value,
					label: value,
				},
		);

		const isDebouncing = search !== debouncedSearch;

		return {
			options,
			selectedOptions,
			search,
			setSearch,
			isLoading:
				listQuery.isLoading || preloadQueries.some((query) => query.isLoading),
			isSearching: enabled && (isDebouncing || listQuery.isFetching),
			error: listQuery.error,
		};
	};
}
