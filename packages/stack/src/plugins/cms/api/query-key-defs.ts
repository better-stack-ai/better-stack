/**
 * Internal query key constants for the CMS plugin.
 * Shared between query-keys.ts (HTTP path) and prefetchForRoute (DB path)
 * to prevent key drift between SSR loaders and SSG prefetching.
 */
import type { CMSReadOptions } from "../types";

export interface ContentListDiscriminator {
	typeSlug: string;
	limit: number;
	offset: number;
	search: string | undefined;
	view?: "content";
}

/**
 * Builds the discriminator object used as the cache key for the content list.
 * Mirrors the params object used in the cmsContent.list resource declaration
 * so both paths stay in sync. An empty/whitespace search term is normalized
 * to `undefined` so it hashes identically to "no search".
 */
export function contentListDiscriminator(params: {
	typeSlug: string;
	limit?: number;
	offset?: number;
	search?: string;
	view?: "content";
}): ContentListDiscriminator {
	return {
		...(params.view ? { view: params.view } : {}),
		typeSlug: params.typeSlug,
		limit: params.limit ?? 20,
		offset: params.offset ?? 0,
		search:
			params.search !== undefined && params.search.trim() === ""
				? undefined
				: params.search,
	};
}

/** Full query key builders — use these with queryClient.setQueryData() */
export const CMS_QUERY_KEYS = {
	/**
	 * Key for the cmsTypes.list() query.
	 * Full key: ["cmsTypes", "list", "list"]
	 */
	typesList: () => ["cmsTypes", "list", "list"] as const,

	/**
	 * Key for the cmsContent.list({ typeSlug, limit, offset }) query.
	 * Full key: ["cmsContent", "list", { typeSlug, limit, offset, search }]
	 */
	contentList: (params: {
		typeSlug: string;
		limit?: number;
		offset?: number;
		search?: string;
		view?: "content";
	}) => ["cmsContent", "list", contentListDiscriminator(params)] as const,

	/**
	 * Key for the cmsContent.detail(typeSlug, id) query.
	 * Full key: ["cmsContent", "detail", typeSlug, id]
	 */
	contentDetail: (typeSlug: string, id: string, options?: CMSReadOptions) =>
		[
			"cmsContent",
			"detail",
			typeSlug,
			id,
			...(options?.view ? [{ view: options.view }] : []),
		] as const,
};
