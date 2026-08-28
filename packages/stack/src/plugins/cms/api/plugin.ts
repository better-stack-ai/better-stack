import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { zodToFormSchema } from "@workspace/ui/lib/schema-converter";
import { cmsSchema as dbSchema } from "../db";
import {
	createListContentQuerySchema,
	DEFAULT_MAX_PAGE_SIZE,
} from "../schemas";
import type { CMSBackendConfig, CMSBackendHooks, ContentType } from "../types";
import {
	getAllContentItems,
	getAllContentTypes,
	getContentItemById,
} from "./getters";
import {
	CMSContentItemParamsSchema,
	CMSContentTypeParamsSchema,
	CMSCreateContentItemBodySchema,
	CMSUpdateContentItemBodySchema,
	createCMSOperations,
} from "./operations";
import { CMS_QUERY_KEYS } from "./query-key-defs";

export {
	CMSContentItemParamsSchema,
	CMSContentTypeParamsSchema,
	CMSCreateContentItemBodySchema,
	CMSUpdateContentItemBodySchema,
} from "./operations";
export type {
	CMSBackendHooks,
	CMSCreateOperationContext,
	CMSCreateResultContext,
	CMSDeleteOperationContext,
	CMSDeleteResultContext,
	CMSOperationErrorContext,
	CMSOperationLifecycleContext,
	CMSUpdateOperationContext,
	CMSUpdateResultContext,
} from "../types";

/** Route keys returned by the CMS client plugin. */
export type CMSRouteKey =
	| "dashboard"
	| "contentList"
	| "newContent"
	| "editContent";

interface CMSPrefetchForRoute {
	(key: "dashboard" | "newContent", qc: QueryClient): Promise<void>;
	(
		key: "contentList",
		qc: QueryClient,
		params: { typeSlug: string },
	): Promise<void>;
	(
		key: "editContent",
		qc: QueryClient,
		params: { typeSlug: string; id: string },
	): Promise<void>;
}

async function syncContentTypes(
	adapter: Adapter,
	config: CMSBackendConfig,
): Promise<void> {
	for (const definition of config.contentTypes) {
		const jsonSchema = JSON.stringify(zodToFormSchema(definition.schema));
		const existing = await adapter.findOne<ContentType>({
			model: "contentType",
			where: [
				{ field: "slug", value: definition.slug, operator: "eq" as const },
			],
		});
		if (existing) {
			await adapter.update({
				model: "contentType",
				where: [{ field: "id", value: existing.id, operator: "eq" as const }],
				update: {
					name: definition.name,
					description: definition.description ?? null,
					jsonSchema,
					fieldConfig: null,
					autoFormVersion: 2,
					updatedAt: new Date(),
				},
			});
			continue;
		}
		try {
			await adapter.create({
				model: "contentType",
				data: {
					name: definition.name,
					slug: definition.slug,
					description: definition.description ?? null,
					jsonSchema,
					fieldConfig: null,
					autoFormVersion: 2,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		} catch (error) {
			const nowExists = await adapter.findOne<ContentType>({
				model: "contentType",
				where: [
					{ field: "slug", value: definition.slug, operator: "eq" as const },
				],
			});
			if (nowExists) continue;
			throw new Error(
				`Failed to create content type "${definition.slug}": ${
					error instanceof Error ? error.message : "Unknown database error"
				}`,
			);
		}
	}
}

/** CMS backend plugin backed by one operation inventory for every transport. */
export const cmsBackendPlugin = (config: CMSBackendConfig) => {
	let syncPromise: Promise<void> | null = null;
	const ensureSynced = (adapter: Adapter) => {
		if (!syncPromise) {
			syncPromise = syncContentTypes(adapter, config).catch((error) => {
				syncPromise = null;
				throw error;
			});
		}
		return syncPromise;
	};
	const getContentTypesWithCounts = async (adapter: Adapter) => {
		const contentTypes = await getAllContentTypes(adapter);
		return Promise.all(
			contentTypes.map(async (contentType) => ({
				...contentType,
				itemCount: await adapter.count({
					model: "contentItem",
					where: [
						{
							field: "contentTypeId",
							value: contentType.id,
							operator: "eq" as const,
						},
					],
				}),
			})),
		);
	};

	/** Trusted raw SSG path; unavailable from HTTP/request operation APIs. */
	const createCMSPrefetchForRoute = (adapter: Adapter): CMSPrefetchForRoute =>
		async function prefetchForRoute(
			key: CMSRouteKey,
			queryClient: QueryClient,
			params?: Record<string, string>,
		): Promise<void> {
			await ensureSynced(adapter);
			switch (key) {
				case "dashboard":
				case "newContent":
					queryClient.setQueryData(
						CMS_QUERY_KEYS.typesList(),
						await getContentTypesWithCounts(adapter),
					);
					break;
				case "contentList": {
					const typeSlug = params?.typeSlug ?? "";
					const [contentTypes, contentItems] = await Promise.all([
						getContentTypesWithCounts(adapter),
						getAllContentItems(adapter, typeSlug, { limit: 20, offset: 0 }),
					]);
					queryClient.setQueryData(CMS_QUERY_KEYS.typesList(), contentTypes);
					queryClient.setQueryData(
						CMS_QUERY_KEYS.contentList({ typeSlug, limit: 20, offset: 0 }),
						{
							pages: [
								{
									items: contentItems.items,
									total: contentItems.total,
									limit: contentItems.limit ?? 20,
									offset: contentItems.offset ?? 0,
								},
							],
							pageParams: [0],
						},
					);
					break;
				}
				case "editContent": {
					const typeSlug = params?.typeSlug ?? "";
					const id = params?.id ?? "";
					const [contentTypes, item] = await Promise.all([
						getContentTypesWithCounts(adapter),
						id ? getContentItemById(adapter, id) : Promise.resolve(null),
					]);
					queryClient.setQueryData(CMS_QUERY_KEYS.typesList(), contentTypes);
					if (id) {
						queryClient.setQueryData(
							CMS_QUERY_KEYS.contentDetail(typeSlug, id),
							item,
						);
					}
					break;
				}
			}
		} as CMSPrefetchForRoute;

	return defineBackendPlugin({
		name: "cms",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) =>
			createCMSOperations(adapter, {
				ensureSynced: () => ensureSynced(adapter),
				getContentTypesWithCounts: () => getContentTypesWithCounts(adapter),
				...(config.maxPageSize !== undefined
					? { maxPageSize: config.maxPageSize }
					: {}),
				...(config.hooks ? { hooks: config.hooks as CMSBackendHooks } : {}),
			}),

		/** Lower-level server API that intentionally bypasses auth and hooks. */
		api: (adapter: Adapter) => ({
			prefetchForRoute: createCMSPrefetchForRoute(adapter),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			const listQuerySchema = createListContentQuerySchema(config.maxPageSize);
			const paginationSchema = z.object({
				limit: z.coerce
					.number()
					.min(1)
					.max(config.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE)
					.optional()
					.default(20),
				offset: z.coerce.number().min(0).optional().default(0),
			});
			const listContentTypes = createEndpoint(
				"/content-types",
				{ method: "GET", requireRequest: true },
				operations.listContentTypes.route(() => ({})),
			);
			const getContentTypeBySlug = createEndpoint(
				"/content-types/:slug",
				{
					method: "GET",
					params: CMSContentTypeParamsSchema,
					requireRequest: true,
				},
				operations.getContentTypeBySlug.route((ctx) => ctx.params),
			);
			const listContentItems = createEndpoint(
				"/content/:typeSlug",
				{
					method: "GET",
					params: z.object({ typeSlug: z.string().min(1) }),
					query: listQuerySchema,
					requireRequest: true,
				},
				operations.listContentItems.route((ctx) => ({
					typeSlug: ctx.params.typeSlug,
					query: ctx.query,
				})),
			);
			const getContentItem = createEndpoint(
				"/content/:typeSlug/:id",
				{
					method: "GET",
					params: CMSContentItemParamsSchema,
					requireRequest: true,
				},
				operations.getContentItem.route((ctx) => ctx.params),
			);
			const createContentItem = createEndpoint(
				"/content/:typeSlug",
				{
					method: "POST",
					params: z.object({ typeSlug: z.string().min(1) }),
					body: CMSCreateContentItemBodySchema,
					requireRequest: true,
				},
				operations.createContentItem.route((ctx) => ({
					typeSlug: ctx.params.typeSlug,
					body: ctx.body,
				})),
			);
			const updateContentItem = createEndpoint(
				"/content/:typeSlug/:id",
				{
					method: "PUT",
					params: CMSContentItemParamsSchema,
					body: CMSUpdateContentItemBodySchema,
					requireRequest: true,
				},
				operations.updateContentItem.route((ctx) => ({
					...ctx.params,
					body: ctx.body,
				})),
			);
			const deleteContentItem = createEndpoint(
				"/content/:typeSlug/:id",
				{
					method: "DELETE",
					params: CMSContentItemParamsSchema,
					requireRequest: true,
				},
				operations.deleteContentItem.route((ctx) => ctx.params),
			);
			const getContentItemPopulated = createEndpoint(
				"/content/:typeSlug/:id/populated",
				{
					method: "GET",
					params: CMSContentItemParamsSchema,
					requireRequest: true,
				},
				operations.getContentItemPopulated.route((ctx) => ctx.params),
			);
			const listContentByRelation = createEndpoint(
				"/content/:typeSlug/by-relation",
				{
					method: "GET",
					params: z.object({ typeSlug: z.string().min(1) }),
					query: z
						.object({ field: z.string(), targetId: z.string() })
						.merge(paginationSchema),
					requireRequest: true,
				},
				operations.listContentByRelation.route((ctx) => ({
					typeSlug: ctx.params.typeSlug,
					query: ctx.query,
				})),
			);
			const getInverseRelations = createEndpoint(
				"/content-types/:slug/inverse-relations",
				{
					method: "GET",
					params: CMSContentTypeParamsSchema,
					query: z.object({ itemId: z.string().optional() }),
					requireRequest: true,
				},
				operations.getInverseRelations.route((ctx) => ({
					slug: ctx.params.slug,
					query: ctx.query,
				})),
			);
			const listInverseRelationItems = createEndpoint(
				"/content-types/:slug/inverse-relations/:sourceType",
				{
					method: "GET",
					params: z.object({
						slug: z.string().min(1),
						sourceType: z.string().min(1),
					}),
					query: z
						.object({ itemId: z.string(), fieldName: z.string() })
						.merge(paginationSchema),
					requireRequest: true,
				},
				operations.listInverseRelationItems.route((ctx) => ({
					slug: ctx.params.slug,
					sourceType: ctx.params.sourceType,
					query: ctx.query,
				})),
			);
			return {
				listContentTypes,
				getContentTypeBySlug,
				listContentItems,
				getContentItem,
				createContentItem,
				updateContentItem,
				deleteContentItem,
				getContentItemPopulated,
				listContentByRelation,
				getInverseRelations,
				listInverseRelationItems,
			} as const;
		},
	});
};

export type CMSApiRouter = ReturnType<
	ReturnType<typeof cmsBackendPlugin>["routes"]
>;
