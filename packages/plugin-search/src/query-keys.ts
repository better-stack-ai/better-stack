import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { StackIdentity } from "@btst/stack/context";
import type { SearchResponse } from "./types";
import { searchResponseSchema } from "./schemas";

/** Identity is a cache discriminator only; it is never sent as HTTP input. */
export type SearchIdentityPartition =
	| StackIdentity
	| { identity: StackIdentity | null; generation: number }
	| `pending:${number}`
	| `error:${number}`;

/** Query arguments shared by the search route, dialog, and SSR loader. */
export interface SearchQueryParams {
	q: string;
	sources?: readonly string[];
	page?: number;
	limit?: number;
}

export const searchResources = {
	searchResults: {
		queries: {
			list: {
				path: "/search",
				query: (
					params: SearchQueryParams,
					_identity?: SearchIdentityPartition,
				) => ({
					q: params.q.trim(),
					sources: params.sources?.join(","),
					page: params.page ?? 1,
					limit: params.limit ?? 20,
				}),
				key: (
					params: SearchQueryParams,
					identity?: SearchIdentityPartition,
				) => [
					{
						q: params.q.trim(),
						sources: params.sources ? [...params.sources].sort() : undefined,
						page: params.page ?? 1,
						limit: params.limit ?? 20,
					},
					identity,
				],
				select: (data: unknown): SearchResponse =>
					searchResponseSchema.parse(data),
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createSearchQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, searchResources, headers);
}
