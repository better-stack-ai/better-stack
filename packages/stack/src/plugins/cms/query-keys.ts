import type { CMSApiRouter } from "./api";
import { normalizeContentFields } from "./schemas";
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
	CMSReadOptions,
	CMSContentFields,
	CMSReadView,
	CMSContentItemResult,
} from "./types";
import {
	contentListDiscriminator,
	contentReadDiscriminator,
	contentReadKey,
} from "./api/query-key-defs";

/** Params for the paginated content list (one page per `limit`). */
export interface ContentListParams extends CMSReadOptions {
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

interface ContentOptionsParams extends CMSReadOptions {
	typeSlug: string;
	search?: string;
	limit?: number;
}

interface ContentByRelationParams extends CMSReadOptions {
	typeSlug: string;
	field: string;
	targetId: string;
	limit?: number;
}

interface InverseRelationsParams {
	slug: string;
	itemId: string;
}

interface InverseRelationItemsParams extends CMSReadOptions {
	slug: string;
	sourceType: string;
	itemId: string;
	fieldName: string;
	limit?: number;
	offset?: number;
}

/** Normalizes an empty/whitespace search term to `undefined`. */
function normalizeSearch(search: string | undefined): string | undefined {
	return search !== undefined && search.trim() === "" ? undefined : search;
}

function relationPageKey(
	params: CMSReadOptions & { limit?: number; offset?: number },
) {
	const limit = params.limit ?? 20;
	const offset = params.offset ?? 0;
	return limit === 20 &&
		offset === 0 &&
		!params.view &&
		params.fields === undefined
		? []
		: [{ limit, offset, ...contentReadDiscriminator(params) }];
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
					view: p.view,
					fields:
						p.fields === undefined
							? undefined
							: JSON.stringify(normalizeContentFields(p.fields)),
					itemId: p.itemId,
					fieldName: p.fieldName,
					limit: p.limit ?? 20,
					offset: p.offset ?? 0,
				}),
				key: (p: InverseRelationItemsParams) => [
					p.slug,
					p.sourceType,
					p.itemId,
					p.fieldName,
					...relationPageKey(p),
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
					view: p.view,
					fields:
						p.fields === undefined
							? undefined
							: JSON.stringify(normalizeContentFields(p.fields)),
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
				params: (typeSlug: string, id: string, _options?: CMSReadOptions) => ({
					typeSlug,
					id,
				}),
				query: (_typeSlug: string, _id: string, options?: CMSReadOptions) => ({
					view: options?.view,
					fields:
						options?.fields === undefined
							? undefined
							: JSON.stringify(normalizeContentFields(options.fields)),
				}),
				key: (typeSlug: string, id: string, options?: CMSReadOptions) => [
					typeSlug,
					id,
					...contentReadKey(options),
				],
				select: (
					data: any,
					_typeSlug: string,
					_id: string,
					_options?: CMSReadOptions,
				): SerializedContentItemWithType | null => data ?? null,
				skip: (typeSlug: string, id: string) => !typeSlug || !id,
			},

			bySlug: {
				path: "/content/:typeSlug",
				params: (
					typeSlug: string,
					_slug: string,
					_options?: CMSReadOptions,
				) => ({ typeSlug }),
				query: (_typeSlug: string, slug: string, options?: CMSReadOptions) => ({
					slug,
					limit: 1,
					view: options?.view,
					fields:
						options?.fields === undefined
							? undefined
							: JSON.stringify(normalizeContentFields(options.fields)),
				}),
				key: (typeSlug: string, slug: string, options?: CMSReadOptions) => [
					"bySlug",
					typeSlug,
					slug,
					...contentReadKey(options),
				],
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
					view: p.view,
					fields:
						p.fields === undefined
							? undefined
							: JSON.stringify(normalizeContentFields(p.fields)),
					field: p.field,
					targetId: p.targetId,
					limit: p.limit ?? 20,
				}),
				key: (p: ContentByRelationParams) => [
					p.typeSlug,
					p.field,
					p.targetId,
					...relationPageKey(p),
				],
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
					view: p.view,
					fields:
						p.fields === undefined
							? undefined
							: JSON.stringify(normalizeContentFields(p.fields)),
					search: normalizeSearch(p.search),
					limit: p.limit ?? 50,
				}),
				key: (p: ContentOptionsParams) => [
					"options",
					p.typeSlug,
					normalizeSearch(p.search),
					p.limit ?? 50,
					...contentReadKey(p),
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
				invalidates: [
					"cmsContent",
					"cmsTypes.list",
					"cmsTypes.inverseRelationItems",
					"cmsTypes.inverseRelations",
				],
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
				invalidates: [
					"cmsContent",
					"cmsTypes.inverseRelationItems",
					"cmsTypes.inverseRelations",
				],
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
				invalidates: [
					"cmsContent",
					"cmsTypes.list",
					"cmsTypes.inverseRelationItems",
					"cmsTypes.inverseRelations",
				],
			},
		},
	},
} satisfies ResourcesDeclaration;

type CMSResourceQueryKeys = ReturnType<
	typeof createResourceQueryKeys<typeof cmsResources>
>;
type ContentQueryResult<TData> = {
	queryKey: readonly unknown[];
	queryFn: (context?: { pageParam?: unknown }) => Promise<TData>;
};
type CMSItemQueryEntry = {
	<
		TView extends CMSReadView = undefined,
		const TFields extends CMSContentFields = undefined,
	>(
		typeSlug: string,
		identity: string,
		options?: CMSReadOptions<TView, TFields>,
	): ContentQueryResult<CMSContentItemResult<
		Record<string, unknown>,
		TView,
		TFields
	> | null>;
	_def: readonly [string, string];
};
type CMSRelationQueryEntry<TParams> = {
	<
		TView extends CMSReadView = undefined,
		const TFields extends CMSContentFields = undefined,
	>(
		params: Omit<TParams, "view" | "fields"> & CMSReadOptions<TView, TFields>,
	): ContentQueryResult<
		PaginatedContentItems<Record<string, unknown>, TView, TFields>
	>;
	_def: readonly [string, string];
};
type CMSQueryKeys = Omit<CMSResourceQueryKeys, "cmsContent" | "cmsTypes"> & {
	cmsTypes: Omit<CMSResourceQueryKeys["cmsTypes"], "inverseRelationItems"> & {
		inverseRelationItems: CMSRelationQueryEntry<InverseRelationItemsParams>;
	};
	cmsContent: Omit<
		CMSResourceQueryKeys["cmsContent"],
		"list" | "detail" | "bySlug" | "byRelation" | "options"
	> & {
		list: {
			<
				TView extends CMSReadView = undefined,
				const TFields extends CMSContentFields = undefined,
			>(
				params: Omit<ContentListParams, "view" | "fields"> &
					CMSReadOptions<TView, TFields>,
			): ContentQueryResult<
				PaginatedContentItems<Record<string, unknown>, TView, TFields>
			>;
			_def: readonly [string, string];
		};
		options: {
			<
				TView extends CMSReadView = undefined,
				const TFields extends CMSContentFields = undefined,
			>(
				params: Omit<ContentOptionsParams, "view" | "fields"> &
					CMSReadOptions<TView, TFields>,
			): ContentQueryResult<
				CMSContentItemResult<Record<string, unknown>, TView, TFields>[]
			>;
			_def: readonly [string, string];
		};
		detail: CMSItemQueryEntry;
		bySlug: CMSItemQueryEntry;
		byRelation: CMSRelationQueryEntry<ContentByRelationParams>;
	};
};

/**
 * Create CMS query keys for React Query
 * Used by consumers and SSR loaders to fetch content types and content items
 */
export function createCMSQueryKeys(
	client: ReturnType<typeof createApiClient<CMSApiRouter>>,
	headers?: HeadersInit,
): CMSQueryKeys {
	return createResourceQueryKeys(client, cmsResources, headers) as CMSQueryKeys;
}
