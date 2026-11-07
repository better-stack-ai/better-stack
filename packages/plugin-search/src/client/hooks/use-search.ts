"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
	useIdentity,
	useIdentitySourceGeneration,
	useStack,
} from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import {
	searchResources,
	type SearchIdentityPartition,
	type SearchQueryParams,
} from "../../query-keys";
import { SEARCH_PLUGIN_ID } from "../constants";

const search = createResource({
	plugin: SEARCH_PLUGIN_ID,
	resources: searchResources,
});

const initialIdentityGenerations = new WeakMap<QueryClient, number>();

/** Search results are isolated and discarded when the resolved identity changes. */
export function useSearch(params: SearchQueryParams, enabled = true) {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	const stack = useStack();
	const queryClient = useQueryClient(stack.queryClient);
	if (!initialIdentityGenerations.has(queryClient))
		initialIdentityGenerations.set(queryClient, generation);
	const partition: SearchIdentityPartition | undefined = isPending
		? `pending:${generation}`
		: error
			? `error:${generation}`
			: initialIdentityGenerations.get(queryClient) !== generation
				? { identity, generation }
				: (identity ?? undefined);
	const partitionKey = JSON.stringify(partition);

	useEffect(() => {
		const filters = {
			queryKey: ["searchResults"],
			predicate: (query: { queryKey: readonly unknown[] }) =>
				JSON.stringify(query.queryKey[3]) !== partitionKey,
		};
		void queryClient.cancelQueries(filters);
		queryClient.removeQueries(filters);
	}, [queryClient, partitionKey]);

	const result = search.searchResults.list.use([params, partition], {
		enabled: enabled && !isPending && !error,
	});
	return {
		...result,
		data: isPending || error ? undefined : result.data,
		error: error ?? result.error,
		isLoading: enabled && (isPending || result.isLoading),
	};
}
