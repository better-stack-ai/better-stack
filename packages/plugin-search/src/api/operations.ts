import { defineOperation, OperationHttpError } from "@btst/stack/plugins/api";
import { z } from "zod";
import { searchPermissions } from "../permissions";
import { searchSnippet } from "../providers";
import {
	SEARCH_MAX_PAGES,
	SEARCH_MAX_RESULTS,
	SEARCH_MAX_SOURCES,
	searchInputSchema,
	searchSourceIdSchema,
	searchProviderResultSchema,
} from "../schemas";
import type { SearchProvider, SearchResponse, SearchResult } from "../types";

export function createSearchOperations(providers: readonly SearchProvider[]) {
	if (providers.length > SEARCH_MAX_SOURCES) {
		throw new Error(`Search supports at most ${SEARCH_MAX_SOURCES} providers`);
	}
	const sorted = [...providers].sort((a, b) =>
		a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	const ids = new Set<string>();
	for (const provider of sorted) {
		searchSourceIdSchema.parse(provider.id);
		z.string().min(1).max(100).parse(provider.label);
		if (ids.has(provider.id))
			throw new Error(`Duplicate search source: ${provider.id}`);
		ids.add(provider.id);
	}
	const sources = sorted.map(({ id, label }) => ({ id, label }));
	return {
		search: defineOperation({
			input: searchInputSchema,
			permission: searchPermissions.query.read,
			facts: ({ input }) => {
				const selected = input.sources?.length
					? [...new Set(input.sources)].sort()
					: sources.map(({ id }) => id);
				if (selected.some((id) => !ids.has(id))) {
					throw new OperationHttpError(
						400,
						"Unknown search source",
						"SEARCH_SOURCE_INVALID",
					);
				}
				return { sources: selected };
			},
			execute: async ({
				input,
				facts,
				request,
				identity,
			}): Promise<SearchResponse> => {
				if (!request)
					throw new OperationHttpError(
						400,
						"Search requires request context",
						"SEARCH_REQUEST_REQUIRED",
					);
				const empty = {
					sources,
					page: input.page,
					limit: input.limit,
					hasMore: false,
					nextPage: null,
					truncated: false,
				};
				if (!input.q) return { ...empty, items: [] };
				let truncated = false;
				const pages = await Promise.all(
					sorted
						.filter((provider) => facts.sources.includes(provider.id))
						.map(async (provider) => {
							try {
								const page = await provider.search({
									q: input.q,
									limit: SEARCH_MAX_RESULTS + 1,
									request,
									identity,
								});
								if (
									page.items.length > SEARCH_MAX_RESULTS + 1 ||
									typeof page.hasMore !== "boolean"
								)
									throw new Error("Invalid provider page");
								truncated ||= page.hasMore;
								const seen = new Set<string>();
								return page.items
									.flatMap((record): SearchResult[] => {
										const item = searchProviderResultSchema.parse(record);
										if (seen.has(item.resourceId)) return [];
										seen.add(item.resourceId);
										return [
											{
												...item,
												snippet: searchSnippet(item.snippet),
												key: `${provider.id}:${item.resourceId}`,
												sourceId: provider.id,
												sourceLabel: provider.label,
											},
										];
									})
									.sort((a, b) =>
										a.resourceId < b.resourceId
											? -1
											: a.resourceId > b.resourceId
												? 1
												: 0,
									);
							} catch {
								throw new OperationHttpError(
									502,
									"A search source is unavailable",
									"SEARCH_PROVIDER_FAILED",
								);
							}
						}),
				);
				const items = pages.flat();
				const end = input.page * input.limit;
				const hasMore =
					input.page < SEARCH_MAX_PAGES &&
					end < Math.min(items.length, SEARCH_MAX_RESULTS);
				return {
					...empty,
					items: items.slice(
						end - input.limit,
						Math.min(end, SEARCH_MAX_RESULTS),
					),
					hasMore,
					nextPage: hasMore ? input.page + 1 : null,
					truncated:
						truncated ||
						items.length >
							Math.min(SEARCH_MAX_RESULTS, input.limit * SEARCH_MAX_PAGES),
				};
			},
		}),
	};
}
