import type { OperationContext } from "@btst/stack/plugins/api";

/** Stable public source metadata; providers are registered only by application code. */
export type SearchSource = {
	id: string;
	label: string;
};

/** A provider's already-authorized public projection. Snippets are plain text. */
export type SearchProviderResult = {
	resourceId: string;
	title: string;
	snippet: string;
	href: string;
};

/** Providers must apply visibility before returning records or continuation metadata. */
export interface SearchProvider extends SearchSource {
	search(context: {
		q: string;
		limit: number;
		request: Request;
		identity: OperationContext<unknown, unknown>["identity"];
	}): Promise<{ items: readonly SearchProviderResult[]; hasMore: boolean }>;
}

/** Result identity is scoped to its source, with no comparable relevance score. */
export type SearchResult = SearchProviderResult & {
	key: string;
	sourceId: string;
	sourceLabel: string;
};

export interface SearchInput {
	q: string;
	sources?: readonly string[] | string;
	page?: number;
	limit?: number;
}

/** Pagination covers a bounded result window, never an exact global total. */
export type SearchResponse = {
	items: SearchResult[];
	sources: SearchSource[];
	page: number;
	limit: number;
	hasMore: boolean;
	nextPage: number | null;
	truncated: boolean;
};

export interface SearchBackendConfig {
	providers?: readonly SearchProvider[];
}
