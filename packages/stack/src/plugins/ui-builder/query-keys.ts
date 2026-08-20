import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type {
	ComponentLayer,
	Variable,
} from "@workspace/ui/components/ui-builder/types";
import type { CMSApiRouter } from "../cms/api";
import { contentListDiscriminator } from "../cms/api/query-key-defs";
import type {
	PaginatedContentItems,
	SerializedContentItemWithType,
} from "../cms/types";
import { UI_BUILDER_TYPE_SLUG, type UIBuilderPageSchemaType } from "./schemas";
import type {
	PaginatedUIBuilderPages,
	SerializedUIBuilderPage,
	UIBuilderPageData,
} from "./types";

export interface UIBuilderPageListParams {
	/** Number of items per page (default: 10). */
	limit?: number;
	/** Included in the cache discriminator; infinite queries start at zero. */
	offset?: number;
}

export interface CreateUIBuilderPageInput {
	slug: string;
	layers: ComponentLayer[];
	variables?: Variable[];
	status?: "published" | "draft" | "archived";
}

export interface UpdateUIBuilderPageInput {
	slug?: string;
	layers?: ComponentLayer[];
	variables?: Variable[];
	status?: "published" | "draft" | "archived";
}

function toUIBuilderPage(
	item: SerializedContentItemWithType<UIBuilderPageSchemaType>,
): SerializedUIBuilderPage {
	return {
		...item,
		parsedData: item.parsedData as UIBuilderPageData,
	};
}

function toUIBuilderPageList(
	data: PaginatedContentItems<UIBuilderPageSchemaType>,
): PaginatedUIBuilderPages {
	return {
		...data,
		items: data.items.map(toUIBuilderPage),
	};
}

function paginatedNextPageParam(
	lastPage: PaginatedUIBuilderPages,
	allPages: PaginatedUIBuilderPages[],
	params: UIBuilderPageListParams,
): number | undefined {
	const limit = params.limit ?? 10;
	const items = Array.isArray(lastPage?.items) ? lastPage.items : [];
	if (items.length < limit) return undefined;

	const loadedCount = allPages.reduce(
		(sum, page) => sum + (Array.isArray(page?.items) ? page.items.length : 0),
		0,
	);
	if (loadedCount >= (lastPage?.total ?? 0)) return undefined;
	return loadedCount;
}

function serializePageData(input: UpdateUIBuilderPageInput) {
	const data: Partial<UIBuilderPageSchemaType> = {};
	if (input.layers !== undefined) data.layers = JSON.stringify(input.layers);
	if (input.variables !== undefined) {
		data.variables = JSON.stringify(input.variables);
	}
	if (input.status !== undefined) data.status = input.status;
	return data;
}

/**
 * UI Builder resource declaration. The `cmsContent` resource name and key
 * discriminators intentionally match the CMS plugin because UI Builder pages
 * are CMS content items. This keeps CMS, SSR-loader, and UI Builder caches in
 * sync without duplicating the CMS hook implementation.
 */
export const uiBuilderResources = {
	cmsContent: {
		queries: {
			list: {
				path: "/content/:typeSlug",
				params: (_params: UIBuilderPageListParams = {}) => ({
					typeSlug: UI_BUILDER_TYPE_SLUG,
				}),
				query: (params: UIBuilderPageListParams = {}) => ({
					limit: params.limit ?? 10,
				}),
				key: (params: UIBuilderPageListParams = {}) => [
					contentListDiscriminator({
						typeSlug: UI_BUILDER_TYPE_SLUG,
						limit: params.limit ?? 10,
						offset: params.offset ?? 0,
					}),
				],
				select: (
					data: PaginatedContentItems<UIBuilderPageSchemaType>,
				): PaginatedUIBuilderPages => toUIBuilderPageList(data),
				infinite: true,
				pageSize: (params: UIBuilderPageListParams = {}) => params.limit ?? 10,
				nextPageParam: paginatedNextPageParam,
			},

			detail: {
				path: "/content/:typeSlug/:id",
				params: (id: string) => ({ typeSlug: UI_BUILDER_TYPE_SLUG, id }),
				key: (id: string) => [UI_BUILDER_TYPE_SLUG, id],
				select: (
					data: SerializedContentItemWithType<UIBuilderPageSchemaType> | null,
				): SerializedUIBuilderPage | null =>
					data ? toUIBuilderPage(data) : null,
				skip: (id: string) => !id,
			},

			bySlug: {
				path: "/content/:typeSlug",
				params: (_slug: string) => ({ typeSlug: UI_BUILDER_TYPE_SLUG }),
				query: (slug: string) => ({ slug, limit: 1 }),
				key: (slug: string) => ["bySlug", UI_BUILDER_TYPE_SLUG, slug],
				select: (
					data: PaginatedContentItems<UIBuilderPageSchemaType>,
				): SerializedUIBuilderPage | null =>
					data?.items?.[0] ? toUIBuilderPage(data.items[0]) : null,
				skip: (slug: string) => !slug,
			},
		},

		mutations: {
			create: {
				path: "@post/content/:typeSlug",
				method: "POST" as const,
				input: (input: CreateUIBuilderPageInput) => ({
					params: { typeSlug: UI_BUILDER_TYPE_SLUG },
					body: {
						slug: input.slug,
						data: {
							layers: JSON.stringify(input.layers),
							variables: JSON.stringify(input.variables ?? []),
							status: input.status ?? "draft",
						} satisfies UIBuilderPageSchemaType,
					},
				}),
				select: (
					data: SerializedContentItemWithType<UIBuilderPageSchemaType>,
				) => toUIBuilderPage(data),
				invalidates: ["cmsContent.list", "cmsTypes.list"],
				refetchType: "all" as const,
				setData: {
					query: "detail",
					args: (created: SerializedUIBuilderPage) => [created.id],
				},
			},

			update: {
				path: "@put/content/:typeSlug/:id",
				method: "PUT" as const,
				input: (vars: { id: string; data: UpdateUIBuilderPageInput }) => {
					const data = serializePageData(vars.data);
					return {
						params: { typeSlug: UI_BUILDER_TYPE_SLUG, id: vars.id },
						body: {
							...(vars.data.slug !== undefined ? { slug: vars.data.slug } : {}),
							...(Object.keys(data).length > 0 ? { data } : {}),
						},
					};
				},
				select: (
					data: SerializedContentItemWithType<UIBuilderPageSchemaType>,
				) => toUIBuilderPage(data),
				invalidates: ["cmsContent.list"],
				refetchType: "all" as const,
				setData: {
					query: "detail",
					args: (updated: SerializedUIBuilderPage) => [updated.id],
				},
			},

			delete: {
				path: "@delete/content/:typeSlug/:id",
				method: "DELETE" as const,
				input: (id: string) => ({
					params: { typeSlug: UI_BUILDER_TYPE_SLUG, id },
				}),
				select: (data: { success: boolean }) => data,
				invalidates: ["cmsContent", "cmsTypes.list"],
				refetchType: "all" as const,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createUIBuilderQueryKeys(
	client: ReturnType<typeof createApiClient<CMSApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, uiBuilderResources, headers);
}

export type UIBuilderQueryKeys = ReturnType<typeof createUIBuilderQueryKeys>;
