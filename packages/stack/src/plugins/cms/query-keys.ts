import type { CMSApiRouter } from "./api";
import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type {
	SerializedContentType,
	SerializedContentItemWithType,
	PaginatedContentItems,
	InverseRelation,
} from "./types";
import { contentListDiscriminator } from "./api/query-key-defs";

/** Params for the paginated content list (one page per `limit`). */
export interface ContentListParams {
	typeSlug: string;
	limit?: number;
	/**
	 * Included in the query key discriminator for compatibility with
	 * callers that pass it explicitly; the infinite query itself injects
	 * the page offset per page (always starting at 0).
	 */
	offset?: number;
	/** Free-text search across item slugs and data values */
	search?: string;
}

interface ContentOptionsParams {
	typeSlug: string;
	search?: string;
	limit?: number;
}

interface ContentByRelationParams {
	typeSlug: string;
	field: string;
	targetId: string;
	limit?: number;
}

interface InverseRelationsParams {
	slug: string;
	itemId: string;
}

interface InverseRelationItemsParams {
	slug: string;
	sourceType: string;
	itemId: string;
	fieldName: string;
}

/** Normalizes an empty/whitespace search term to `undefined`. */
function normalizeSearch(search: string | undefined): string | undefined {
	return search !== undefined && search.trim() === "" ? undefined : search;
}

/**
 * `getNextPageParam` for `{ items, total }` page envelopes: stop when the
 * last page is short or everything is loaded, otherwise continue at the
 * loaded-item offset.
 */
function paginatedNextPageParam(
	lastPage: PaginatedContentItems,
	allPages: PaginatedContentItems[],
	limit: number,
): number | undefined {
	const items = Array.isArray(lastPage?.items) ? lastPage.items : [];
	if (items.length < limit) return undefined;
	const loadedCount = allPages.reduce(
		(sum, page) => sum + (Array.isArray(page?.items) ? page.items.length : 0),
		0,
	);
	const total = lastPage?.total ?? 0;
	if (loadedCount >= total) return undefined;
	return loadedCount;
}

/**
 * CMS resource declaration — the single source of truth for query keys,
 * HTTP mappings and mutations. Feeds both `createCMSQueryKeys` (SSR
 * loaders) and `createResource` (client hooks, see `client/hooks`).
 *
 * Key shapes intentionally match `CMS_QUERY_KEYS` in
 * `api/query-key-defs.ts` so SSG `prefetchForRoute` hydration keeps working.
 * List pages stay as `{ items, total, limit, offset }` envelopes (via
 * `nextPageParam`) so `total` survives SSG dehydration.
 */
export const cmsResources = {
	cmsTypes: {
		queries: {
			list: {
				path: "/content-types",
				key: () => ["list"],
				select: (
					data: any,
				): (SerializedContentType & { itemCount: number })[] => data ?? [],
			},

			detail: {
				path: "/content-types/:slug",
				params: (slug: string) => ({ slug }),
				key: (slug: string) => [slug],
				select: (data: any, _slug: string): SerializedContentType | null =>
					data ?? null,
				skip: (slug: string) => !slug,
			},

			inverseRelations: {
				path: "/content-types/:slug/inverse-relations",
				params: (p: InverseRelationsParams) => ({ slug: p.slug }),
				query: (p: InverseRelationsParams) => ({ itemId: p.itemId }),
				key: (p: InverseRelationsParams) => [p.slug, p.itemId],
				select: (data: any): InverseRelation[] => data?.inverseRelations ?? [],
			},

			inverseRelationItems: {
				path: "/content-types/:slug/inverse-relations/:sourceType",
				params: (p: InverseRelationItemsParams) => ({
					slug: p.slug,
					sourceType: p.sourceType,
				}),
				query: (p: InverseRelationItemsParams) => ({
					itemId: p.itemId,
					fieldName: p.fieldName,
				}),
				key: (p: InverseRelationItemsParams) => [
					p.slug,
					p.sourceType,
					p.itemId,
					p.fieldName,
				],
				select: (
					data: any,
				): { items: SerializedContentItemWithType[]; total: number } =>
					data ?? { items: [], total: 0 },
			},
		},
	},

	cmsContent: {
		queries: {
			list: {
				path: "/content/:typeSlug",
				params: (p: ContentListParams) => ({ typeSlug: p.typeSlug }),
				query: (p: ContentListParams) => ({
					limit: p.limit ?? 20,
					search: normalizeSearch(p.search),
				}),
				key: (p: ContentListParams) => [contentListDiscriminator(p)],
				select: (data: any, _p: ContentListParams): PaginatedContentItems =>
					data,
				infinite: true,
				pageSize: (p: ContentListParams) => p.limit ?? 20,
				nextPageParam: (
					lastPage: PaginatedContentItems,
					allPages: PaginatedContentItems[],
					p: ContentListParams,
				) => paginatedNextPageParam(lastPage, allPages, p.limit ?? 20),
			},

			detail: {
				path: "/content/:typeSlug/:id",
				params: (typeSlug: string, id: string) => ({ typeSlug, id }),
				key: (typeSlug: string, id: string) => [typeSlug, id],
				select: (
					data: any,
					_typeSlug: string,
					_id: string,
				): SerializedContentItemWithType | null => data ?? null,
				skip: (typeSlug: string, id: string) => !typeSlug || !id,
			},

			bySlug: {
				path: "/content/:typeSlug",
				params: (typeSlug: string, _slug: string) => ({ typeSlug }),
				query: (_typeSlug: string, slug: string) => ({ slug, limit: 1 }),
				key: (typeSlug: string, slug: string) => ["bySlug", typeSlug, slug],
				select: (data: any): SerializedContentItemWithType | null =>
					data?.items?.[0] ?? null,
				skip: (typeSlug: string, slug: string) => !typeSlug || !slug,
			},

			populated: {
				path: "/content/:typeSlug/:id/populated",
				params: (typeSlug: string, id: string) => ({ typeSlug, id }),
				key: (typeSlug: string, id: string) => [typeSlug, id],
				select: (data: any): SerializedContentItemWithType | null =>
					data ?? null,
				skip: (typeSlug: string, id: string) => !typeSlug || !id,
			},

			byRelation: {
				path: "/content/:typeSlug/by-relation",
				params: (p: ContentByRelationParams) => ({ typeSlug: p.typeSlug }),
				query: (p: ContentByRelationParams) => ({
					field: p.field,
					targetId: p.targetId,
					limit: p.limit ?? 20,
				}),
				key: (p: ContentByRelationParams) => [p.typeSlug, p.field, p.targetId],
				select: (
					data: any,
					_p: ContentByRelationParams,
				): PaginatedContentItems => data,
				infinite: true,
				pageSize: (p: ContentByRelationParams) => p.limit ?? 20,
				nextPageParam: (
					lastPage: PaginatedContentItems,
					allPages: PaginatedContentItems[],
					p: ContentByRelationParams,
				) => paginatedNextPageParam(lastPage, allPages, p.limit ?? 20),
			},

			// Non-infinite options query for relation pickers (useSelect)
			options: {
				path: "/content/:typeSlug",
				params: (p: ContentOptionsParams) => ({ typeSlug: p.typeSlug }),
				query: (p: ContentOptionsParams) => ({
					search: normalizeSearch(p.search),
					limit: p.limit ?? 50,
				}),
				key: (p: ContentOptionsParams) => [
					"options",
					p.typeSlug,
					normalizeSearch(p.search),
					p.limit ?? 50,
				],
				select: (
					data: any,
					_p: ContentOptionsParams,
				): SerializedContentItemWithType[] => data?.items ?? [],
			},
		},

		mutations: {
			create: {
				path: "@post/content/:typeSlug",
				method: "POST" as const,
				input: (vars: {
					typeSlug: string;
					slug: string;
					data: Record<string, unknown>;
				}) => ({
					params: { typeSlug: vars.typeSlug },
					body: { slug: vars.slug, data: vars.data },
				}),
				select: (data: any) => data as SerializedContentItemWithType | null,
				invalidates: ["cmsContent.list", "cmsTypes.list"],
			},
			update: {
				path: "@put/content/:typeSlug/:id",
				method: "PUT" as const,
				input: (vars: {
					typeSlug: string;
					id: string;
					data: { slug?: string; data?: Record<string, unknown> };
				}) => ({
					params: { typeSlug: vars.typeSlug, id: vars.id },
					body: vars.data,
				}),
				select: (data: any) => data as SerializedContentItemWithType | null,
				invalidates: ["cmsContent.list"],
				setData: {
					query: "detail",
					args: (updated: SerializedContentItemWithType | null) =>
						updated?.contentType?.slug
							? [updated.contentType.slug, updated.id]
							: null,
				},
			},
			delete: {
				path: "@delete/content/:typeSlug/:id",
				method: "DELETE" as const,
				input: (vars: { typeSlug: string; id: string }) => ({
					params: { typeSlug: vars.typeSlug, id: vars.id },
				}),
				select: (data: any) => data as { success: boolean },
				invalidates: ["cmsContent", "cmsTypes.list"],
			},
		},
	},
} satisfies ResourcesDeclaration;

/**
 * Create CMS query keys for React Query
 * Used by consumers and SSR loaders to fetch content types and content items
 */
export function createCMSQueryKeys(
	client: ReturnType<typeof createApiClient<CMSApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, cmsResources, headers);
}
