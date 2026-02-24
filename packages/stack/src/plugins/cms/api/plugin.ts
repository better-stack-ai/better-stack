import type { Adapter } from "@btst/db";
import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import {
	zodToFormSchema,
	formSchemaToZod,
} from "@workspace/ui/lib/schema-converter";
import { cmsSchema as dbSchema } from "../db";
import type {
	ContentType,
	ContentItem,
	ContentItemWithType,
	ContentRelation,
	CMSBackendConfig,
	CMSHookContext,
	SerializedContentItemWithType,
	RelationConfig,
	RelationValue,
	InverseRelation,
} from "../types";
import { listContentQuerySchema } from "../schemas";
import { slugify } from "../utils";
import {
	getAllContentTypes,
	getAllContentItems,
	getContentItemBySlug,
	getContentItemById,
	serializeContentType,
	serializeContentItem,
	serializeContentItemWithType,
} from "./getters";
import type { QueryClient } from "@tanstack/react-query";
import { CMS_QUERY_KEYS } from "./query-key-defs";

/**
 * Route keys for the CMS plugin — matches the keys returned by
 * `stackClient.router.getRoute(path).routeKey`.
 */
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

/**
 * Sync content types from config to database
 * Creates or updates content types based on the developer's Zod schemas
 *
 * Always writes version 2 format:
 * - fieldType is embedded in jsonSchema via .meta()
 * - fieldConfig is set to null (no longer used)
 * - autoFormVersion is set to 2
 *
 * Handles race conditions from multiple instances by catching unique constraint
 * errors and verifying the record exists (another instance created it first).
 */
async function syncContentTypes(
	adapter: Adapter,
	config: CMSBackendConfig,
): Promise<void> {
	for (const ct of config.contentTypes) {
		// Convert Zod schema to JSON Schema using zodToFormSchema
		// This properly handles dates, date constraints, and steps metadata
		const jsonSchema = JSON.stringify(zodToFormSchema(ct.schema));

		const existing = await adapter.findOne<ContentType>({
			model: "contentType",
			where: [{ field: "slug", value: ct.slug, operator: "eq" as const }],
		});

		if (existing) {
			await adapter.update({
				model: "contentType",
				where: [{ field: "id", value: existing.id, operator: "eq" as const }],
				update: {
					name: ct.name,
					description: ct.description ?? null,
					jsonSchema,
					fieldConfig: null, // No longer used in version 2
					autoFormVersion: 2,
					updatedAt: new Date(),
				},
			});
		} else {
			try {
				await adapter.create({
					model: "contentType",
					data: {
						name: ct.name,
						slug: ct.slug,
						description: ct.description ?? null,
						jsonSchema,
						fieldConfig: null, // No longer used in version 2
						autoFormVersion: 2,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				});
			} catch (err) {
				// Handle race condition: another instance may have created this content type
				// Check if the record now exists - if so, another instance beat us to it
				const nowExists = await adapter.findOne<ContentType>({
					model: "contentType",
					where: [{ field: "slug", value: ct.slug, operator: "eq" as const }],
				});
				if (nowExists) {
					// Record exists now (created by another instance), continue to next content type
					continue;
				}
				// Record still doesn't exist - this is a genuine database error, re-throw with context
				const message =
					err instanceof Error ? err.message : "Unknown database error";
				throw new Error(
					`Failed to create content type "${ct.slug}": ${message}`,
				);
			}
		}
	}
}

/**
 * Get Zod schema for a content type from its JSON Schema
 * Uses formSchemaToZod to properly handle dates, date constraints, and steps metadata
 */
function getContentTypeZodSchema(contentType: ContentType): z.ZodTypeAny {
	const jsonSchema = JSON.parse(contentType.jsonSchema);
	return formSchemaToZod(jsonSchema);
}

// ========== Relation Helpers ==========

interface JsonSchemaProperty {
	fieldType?: string;
	relation?: RelationConfig;
	type?: string;
	items?: JsonSchemaProperty;
	[key: string]: unknown;
}

interface JsonSchemaWithProperties {
	properties?: Record<string, JsonSchemaProperty>;
	[key: string]: unknown;
}

/**
 * Extract relation field configurations from a content type's JSON Schema
 */
function extractRelationFields(
	contentType: ContentType,
): Record<string, RelationConfig> {
	const jsonSchema = JSON.parse(
		contentType.jsonSchema,
	) as JsonSchemaWithProperties;
	const properties = jsonSchema.properties || {};
	const relationFields: Record<string, RelationConfig> = {};

	for (const [fieldName, fieldSchema] of Object.entries(properties)) {
		if (fieldSchema.fieldType === "relation" && fieldSchema.relation) {
			relationFields[fieldName] = fieldSchema.relation;
		}
	}

	return relationFields;
}

/**
 * Check if a value is a "new" relation item (to be created)
 */
function isNewRelationValue(
	value: unknown,
): value is { _new: true; data: Record<string, unknown> } {
	return (
		typeof value === "object" &&
		value !== null &&
		"_new" in value &&
		(value as { _new: unknown })._new === true &&
		"data" in value
	);
}

/**
 * Check if a value is an existing relation reference
 */
function isExistingRelationValue(value: unknown): value is { id: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		typeof (value as { id: unknown }).id === "string"
	);
}

/**
 * Process relation fields in content data:
 * 1. Create new items from _new values
 * 2. Extract IDs for junction table
 * 3. Return cleaned data with only IDs stored
 *
 * Only processes relation fields that are explicitly present in the data.
 * Fields not present in data are skipped entirely - this preserves existing
 * relations during partial updates.
 *
 * @returns Object with processedData (for storing) and relationIds (for junction table sync)
 */
async function processRelationsInData(
	adapter: Adapter,
	contentType: ContentType,
	data: Record<string, unknown>,
	getContentTypeFn: (slug: string) => Promise<ContentType | null>,
): Promise<{
	processedData: Record<string, unknown>;
	relationIds: Record<string, string[]>;
}> {
	const relationFields = extractRelationFields(contentType);
	const processedData = { ...data };
	const relationIds: Record<string, string[]> = {};

	for (const [fieldName, relationConfig] of Object.entries(relationFields)) {
		// Skip fields not present in the data - this preserves existing relations
		// during partial updates. Only process fields explicitly included.
		if (!(fieldName in data)) {
			continue;
		}

		const fieldValue = data[fieldName];
		// Field is present but null/undefined/empty - clear relations for this field
		if (!fieldValue) {
			relationIds[fieldName] = [];
			continue;
		}

		// Get target content type
		const targetContentType = await getContentTypeFn(relationConfig.targetType);
		if (!targetContentType) {
			throw new Error(
				`Target content type "${relationConfig.targetType}" not found for relation field "${fieldName}"`,
			);
		}

		const ids: string[] = [];

		if (relationConfig.type === "belongsTo") {
			// Single relation
			const value = fieldValue as RelationValue;
			if (isNewRelationValue(value)) {
				// Create the new item
				const newItem = await createRelatedItem(
					adapter,
					targetContentType,
					value.data,
				);
				ids.push(newItem.id);
				// Store only the ID in processedData
				processedData[fieldName] = { id: newItem.id };
			} else if (isExistingRelationValue(value)) {
				ids.push(value.id);
				// Keep as-is (already an ID reference)
			}
		} else {
			// Array relation (hasMany / manyToMany)
			const values = (
				Array.isArray(fieldValue) ? fieldValue : []
			) as RelationValue[];
			const processedValues: Array<{ id: string }> = [];

			for (const value of values) {
				if (isNewRelationValue(value)) {
					// Create the new item
					const newItem = await createRelatedItem(
						adapter,
						targetContentType,
						value.data,
					);
					ids.push(newItem.id);
					processedValues.push({ id: newItem.id });
				} else if (isExistingRelationValue(value)) {
					ids.push(value.id);
					processedValues.push({ id: value.id });
				}
			}

			processedData[fieldName] = processedValues;
		}

		relationIds[fieldName] = ids;
	}

	return { processedData, relationIds };
}

/**
 * Create a related content item
 */
async function createRelatedItem(
	adapter: Adapter,
	targetContentType: ContentType,
	data: Record<string, unknown>,
): Promise<ContentItem> {
	// Generate slug from common name fields or use timestamp
	const slug = slugify(
		(data.slug as string) ||
			(data.name as string) ||
			(data.title as string) ||
			`item-${Date.now()}`,
	);

	// Validate against target content type schema
	const zodSchema = getContentTypeZodSchema(targetContentType);
	const validation = zodSchema.safeParse(data);
	if (!validation.success) {
		throw new Error(
			`Validation failed for new ${targetContentType.slug}: ${JSON.stringify(validation.error.issues)}`,
		);
	}

	// Check for duplicate slug
	const existing = await adapter.findOne<ContentItem>({
		model: "contentItem",
		where: [
			{
				field: "contentTypeId",
				value: targetContentType.id,
				operator: "eq" as const,
			},
			{ field: "slug", value: slug, operator: "eq" as const },
		],
	});

	if (existing) {
		// If item with same slug exists, return it instead of creating duplicate
		return existing;
	}

	// Create the item
	const item = await adapter.create<ContentItem>({
		model: "contentItem",
		data: {
			contentTypeId: targetContentType.id,
			slug,
			data: JSON.stringify(validation.data),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});

	return item;
}

/**
 * Sync relations in the junction table for a content item.
 *
 * Only updates relations for fields explicitly present in relationIds.
 * Fields not in relationIds are left unchanged - this preserves existing
 * relations during partial updates.
 */
async function syncRelations(
	adapter: Adapter,
	sourceId: string,
	relationIds: Record<string, string[]>,
): Promise<void> {
	// Only sync fields that are explicitly included in relationIds
	for (const [fieldName, targetIds] of Object.entries(relationIds)) {
		// Delete existing relations for this specific field only
		await adapter.delete({
			model: "contentRelation",
			where: [
				{ field: "sourceId", value: sourceId, operator: "eq" as const },
				{ field: "fieldName", value: fieldName, operator: "eq" as const },
			],
		});

		// Create new relations for this field
		for (const targetId of targetIds) {
			await adapter.create<ContentRelation>({
				model: "contentRelation",
				data: {
					sourceId,
					targetId,
					fieldName,
					createdAt: new Date(),
				},
			});
		}
	}
}

/**
 * Populate relations for a content item by fetching related items
 */
async function populateRelations(
	adapter: Adapter,
	item: ContentItemWithType,
): Promise<Record<string, SerializedContentItemWithType[]>> {
	const relations: Record<string, SerializedContentItemWithType[]> = {};

	// Get all relations for this item
	const contentRelations = await adapter.findMany<ContentRelation>({
		model: "contentRelation",
		where: [{ field: "sourceId", value: item.id, operator: "eq" as const }],
	});

	// Group by field name
	const relationsByField: Record<string, string[]> = {};
	for (const rel of contentRelations) {
		if (!relationsByField[rel.fieldName]) {
			relationsByField[rel.fieldName] = [];
		}
		relationsByField[rel.fieldName]!.push(rel.targetId);
	}

	// Fetch related items for each field
	for (const [fieldName, targetIds] of Object.entries(relationsByField)) {
		if (targetIds.length === 0) {
			relations[fieldName] = [];
			continue;
		}

		const relatedItems: SerializedContentItemWithType[] = [];
		for (const targetId of targetIds) {
			const relatedItem = await adapter.findOne<ContentItemWithType>({
				model: "contentItem",
				where: [{ field: "id", value: targetId, operator: "eq" as const }],
				join: { contentType: true },
			});
			if (relatedItem) {
				relatedItems.push(serializeContentItemWithType(relatedItem));
			}
		}
		relations[fieldName] = relatedItems;
	}

	return relations;
}

/**
 * CMS backend plugin
 * Provides API endpoints for managing content types and content items
 *
 * @param config - Configuration with content types and optional hooks
 */
export const cmsBackendPlugin = (config: CMSBackendConfig) => {
	// Shared sync state — used by both the api factory and routes handlers so
	// that calling a getter before any HTTP request has been made still
	// triggers the one-time content-type sync.
	let syncPromise: Promise<void> | null = null;

	const ensureSynced = (adapter: Adapter) => {
		if (!syncPromise) {
			syncPromise = syncContentTypes(adapter, config).catch((err) => {
				// Allow retry on next call if sync fails
				syncPromise = null;
				throw err;
			});
		}
		return syncPromise;
	};

	const createCMSPrefetchForRoute = (adapter: Adapter): CMSPrefetchForRoute => {
		return async function prefetchForRoute(
			key: CMSRouteKey,
			qc: QueryClient,
			params?: Record<string, string>,
		): Promise<void> {
			// Sync content types once at the top — idempotent for concurrent SSG calls
			await ensureSynced(adapter);

			switch (key) {
				case "dashboard":
				case "newContent": {
					// Fetch content types with item counts to match the HTTP endpoint shape
					const contentTypes = await getAllContentTypes(adapter);
					const typesWithCounts = await Promise.all(
						contentTypes.map(async (ct) => {
							const count: number = await adapter.count({
								model: "contentItem",
								where: [
									{
										field: "contentTypeId",
										value: ct.id,
										operator: "eq" as const,
									},
								],
							});
							return { ...ct, itemCount: count };
						}),
					);
					qc.setQueryData(CMS_QUERY_KEYS.typesList(), typesWithCounts);
					break;
				}
				case "contentList": {
					const typeSlug = params?.typeSlug ?? "";
					const [contentTypes, contentItems] = await Promise.all([
						getAllContentTypes(adapter).then(async (types) => {
							return Promise.all(
								types.map(async (ct) => {
									const count: number = await adapter.count({
										model: "contentItem",
										where: [
											{
												field: "contentTypeId",
												value: ct.id,
												operator: "eq" as const,
											},
										],
									});
									return { ...ct, itemCount: count };
								}),
							);
						}),
						getAllContentItems(adapter, typeSlug, { limit: 20, offset: 0 }),
					]);
					qc.setQueryData(CMS_QUERY_KEYS.typesList(), contentTypes);
					qc.setQueryData(
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
						getAllContentTypes(adapter).then(async (types) => {
							return Promise.all(
								types.map(async (ct) => {
									const count: number = await adapter.count({
										model: "contentItem",
										where: [
											{
												field: "contentTypeId",
												value: ct.id,
												operator: "eq" as const,
											},
										],
									});
									return { ...ct, itemCount: count };
								}),
							);
						}),
						id ? getContentItemById(adapter, id) : Promise.resolve(null),
					]);
					qc.setQueryData(CMS_QUERY_KEYS.typesList(), contentTypes);
					if (id) {
						qc.setQueryData(CMS_QUERY_KEYS.contentDetail(typeSlug, id), item);
					}
					break;
				}
				default:
					break;
			}
		} as CMSPrefetchForRoute;
	};

	return defineBackendPlugin({
		name: "cms",

		dbPlugin: dbSchema,

		api: (adapter) => ({
			getAllContentTypes: async () => {
				await ensureSynced(adapter);
				return getAllContentTypes(adapter);
			},
			getAllContentItems: async (
				contentTypeSlug: string,
				params?: Parameters<typeof getAllContentItems>[2],
			) => {
				await ensureSynced(adapter);
				return getAllContentItems(adapter, contentTypeSlug, params);
			},
			getContentItemBySlug: async (contentTypeSlug: string, slug: string) => {
				await ensureSynced(adapter);
				return getContentItemBySlug(adapter, contentTypeSlug, slug);
			},
			getContentItemById: async (id: string) => {
				await ensureSynced(adapter);
				return getContentItemById(adapter, id);
			},
			prefetchForRoute: createCMSPrefetchForRoute(adapter),
		}),

		routes: (adapter: Adapter) => {
			// Helper to get content type by slug
			const getContentType = async (
				slug: string,
			): Promise<ContentType | null> => {
				await ensureSynced(adapter);
				return adapter.findOne<ContentType>({
					model: "contentType",
					where: [{ field: "slug", value: slug, operator: "eq" as const }],
				});
			};

			// Helper to create hook context
			const createContext = (
				typeSlug: string,
				headers?: Headers,
			): CMSHookContext => ({
				typeSlug,
				headers,
			});

			// ========== Content Type Endpoints ==========

			const listContentTypes = createEndpoint(
				"/content-types",
				{ method: "GET" },
				async (ctx) => {
					await ensureSynced(adapter);

					const contentTypes = await adapter.findMany<ContentType>({
						model: "contentType",
						sortBy: { field: "name", direction: "asc" },
					});

					// Get item counts for each content type
					const typesWithCounts = await Promise.all(
						contentTypes.map(async (ct) => {
							const items = await adapter.findMany<ContentItem>({
								model: "contentItem",
								where: [
									{
										field: "contentTypeId",
										value: ct.id,
										operator: "eq" as const,
									},
								],
							});
							return {
								...serializeContentType(ct),
								itemCount: items.length,
							};
						}),
					);

					return typesWithCounts;
				},
			);

			const getContentTypeBySlug = createEndpoint(
				"/content-types/:slug",
				{
					method: "GET",
					params: z.object({ slug: z.string() }),
				},
				async (ctx) => {
					const { slug } = ctx.params;
					const contentType = await getContentType(slug);

					if (!contentType) {
						throw ctx.error(404, { message: "Content type not found" });
					}

					return serializeContentType(contentType);
				},
			);

			// ========== Content Item Endpoints ==========

			const listContentItems = createEndpoint(
				"/content/:typeSlug",
				{
					method: "GET",
					params: z.object({ typeSlug: z.string() }),
					query: listContentQuerySchema,
				},
				async (ctx) => {
					const { typeSlug } = ctx.params;
					const { slug, limit, offset } = ctx.query;

					const contentType = await getContentType(typeSlug);
					if (!contentType) {
						throw ctx.error(404, { message: "Content type not found" });
					}

					return getAllContentItems(adapter, typeSlug, { slug, limit, offset });
				},
			);

			const getContentItem = createEndpoint(
				"/content/:typeSlug/:id",
				{
					method: "GET",
					params: z.object({ typeSlug: z.string(), id: z.string() }),
				},
				async (ctx) => {
					const { typeSlug, id } = ctx.params;

					const contentType = await getContentType(typeSlug);
					if (!contentType) {
						throw ctx.error(404, { message: "Content type not found" });
					}

					const item = await adapter.findOne<ContentItemWithType>({
						model: "contentItem",
						where: [{ field: "id", value: id, operator: "eq" as const }],
						join: { contentType: true },
					});

					if (!item || item.contentTypeId !== contentType.id) {
						throw ctx.error(404, { message: "Content item not found" });
					}

					return serializeContentItemWithType(item);
				},
			);

			const createContentItem = createEndpoint(
				"/content/:typeSlug",
				{
					method: "POST",
					params: z.object({ typeSlug: z.string() }),
					body: z.object({
						slug: z.string().min(1),
						// Use passthrough object instead of z.record(z.unknown()) due to Zod v4 bug
						data: z.object({}).passthrough(),
					}),
				},
				async (ctx) => {
					const { typeSlug } = ctx.params;
					const { slug: rawSlug, data } = ctx.body;
					const context = createContext(typeSlug, ctx.headers);

					// Sanitize slug to ensure it's URL-safe
					const slug = slugify(rawSlug);

					// Validate that slugification produced a non-empty result
					if (!slug) {
						throw ctx.error(400, {
							message:
								"Invalid slug: must contain at least one alphanumeric character",
						});
					}

					const contentType = await getContentType(typeSlug);
					if (!contentType) {
						throw ctx.error(404, { message: "Content type not found" });
					}

					// Process relation fields FIRST - this creates new items from _new values
					// and converts them to ID references before Zod validation
					const { processedData: dataWithResolvedRelations, relationIds } =
						await processRelationsInData(
							adapter,
							contentType,
							data as Record<string, unknown>,
							getContentType,
						);

					// Validate data against content type schema (now with resolved relations)
					const zodSchema = getContentTypeZodSchema(contentType);
					const validation = zodSchema.safeParse(dataWithResolvedRelations);
					if (!validation.success) {
						throw ctx.error(400, {
							message: "Validation failed",
							errors: validation.error.issues,
						});
					}

					// Check for duplicate slug within content type
					const existing = await adapter.findOne<ContentItem>({
						model: "contentItem",
						where: [
							{
								field: "contentTypeId",
								value: contentType.id,
								operator: "eq" as const,
							},
							{ field: "slug", value: slug, operator: "eq" as const },
						],
					});
					if (existing) {
						throw ctx.error(409, {
							message: "Content item with this slug already exists",
						});
					}

					// Call before hook - may deny operation
					const processedData = validation.data as Record<string, unknown>;
					if (config.hooks?.onBeforeCreate) {
						const result = await config.hooks.onBeforeCreate(
							processedData,
							context,
						);
						if (result === false) {
							throw ctx.error(403, { message: "Create operation denied" });
						}
					}

					const item = await adapter.create<ContentItem>({
						model: "contentItem",
						data: {
							contentTypeId: contentType.id,
							slug,
							data: JSON.stringify(processedData),
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});

					// Sync relations to junction table
					await syncRelations(adapter, item.id, relationIds);

					const serialized = serializeContentItem(item);

					// Call after hook
					if (config.hooks?.onAfterCreate) {
						await config.hooks.onAfterCreate(serialized, context);
					}

					return {
						...serialized,
						parsedData: processedData,
					};
				},
			);

			const updateContentItem = createEndpoint(
				"/content/:typeSlug/:id",
				{
					method: "PUT",
					params: z.object({ typeSlug: z.string(), id: z.string() }),
					body: z.object({
						slug: z.string().min(1).optional(),
						// Use passthrough object instead of z.record(z.unknown()) due to Zod v4 bug
						data: z.object({}).passthrough().optional(),
					}),
				},
				async (ctx) => {
					const { typeSlug, id } = ctx.params;
					const { slug: rawSlug, data } = ctx.body;
					const context = createContext(typeSlug, ctx.headers);

					// Sanitize slug if provided to ensure it's URL-safe
					const slug = rawSlug ? slugify(rawSlug) : undefined;

					// Validate that slugification produced a non-empty result (if slug was provided)
					if (rawSlug && !slug) {
						throw ctx.error(400, {
							message:
								"Invalid slug: must contain at least one alphanumeric character",
						});
					}

					const contentType = await getContentType(typeSlug);
					if (!contentType) {
						throw ctx.error(404, { message: "Content type not found" });
					}

					const existing = await adapter.findOne<ContentItem>({
						model: "contentItem",
						where: [{ field: "id", value: id, operator: "eq" as const }],
					});

					if (!existing || existing.contentTypeId !== contentType.id) {
						throw ctx.error(404, { message: "Content item not found" });
					}

					// Check for duplicate slug if slug is being changed
					if (slug && slug !== existing.slug) {
						const duplicate = await adapter.findOne<ContentItem>({
							model: "contentItem",
							where: [
								{
									field: "contentTypeId",
									value: contentType.id,
									operator: "eq" as const,
								},
								{ field: "slug", value: slug, operator: "eq" as const },
							],
						});
						if (duplicate) {
							throw ctx.error(409, {
								message: "Content item with this slug already exists",
							});
						}
					}

					// Process relation fields FIRST if data is being updated
					// This creates new items from _new values before Zod validation
					let dataWithResolvedRelations: Record<string, unknown> | undefined;
					let relationIds: Record<string, string[]> | undefined;
					if (data) {
						const result = await processRelationsInData(
							adapter,
							contentType,
							data as Record<string, unknown>,
							getContentType,
						);
						dataWithResolvedRelations = result.processedData;
						relationIds = result.relationIds;
					}

					// Validate data if provided (now with resolved relations)
					// IMPORTANT: Merge with existing data BEFORE Zod validation to prevent
					// schema defaults (like .default([])) from overwriting existing values
					// for fields not included in the partial update.
					let validatedData = dataWithResolvedRelations;
					if (dataWithResolvedRelations) {
						// Parse existing data and merge with update data
						// Update data takes precedence, but existing fields are preserved
						const existingData = existing.data
							? (JSON.parse(existing.data) as Record<string, unknown>)
							: {};
						const mergedData = {
							...existingData,
							...dataWithResolvedRelations,
						};

						const zodSchema = getContentTypeZodSchema(contentType);
						const validation = zodSchema.safeParse(mergedData);
						if (!validation.success) {
							throw ctx.error(400, {
								message: "Validation failed",
								errors: validation.error.issues,
							});
						}
						validatedData = validation.data as Record<string, unknown>;
					}

					// Call before hook - may deny operation
					const processedData = validatedData;
					if (config.hooks?.onBeforeUpdate && validatedData) {
						const result = await config.hooks.onBeforeUpdate(
							id,
							validatedData,
							context,
						);
						if (result === false) {
							throw ctx.error(403, { message: "Update operation denied" });
						}
					}

					// Sync relations to junction table if data was updated
					if (relationIds) {
						await syncRelations(adapter, id, relationIds);
					}

					const updateData: Partial<ContentItem> = {
						updatedAt: new Date(),
					};
					if (slug) updateData.slug = slug;
					if (processedData) updateData.data = JSON.stringify(processedData);

					await adapter.update({
						model: "contentItem",
						where: [{ field: "id", value: id, operator: "eq" as const }],
						update: updateData,
					});

					const updated = await adapter.findOne<ContentItemWithType>({
						model: "contentItem",
						where: [{ field: "id", value: id, operator: "eq" as const }],
						join: { contentType: true },
					});

					if (!updated) {
						throw ctx.error(500, { message: "Failed to fetch updated item" });
					}

					const serialized = serializeContentItem(updated);

					// Call after hook
					if (config.hooks?.onAfterUpdate) {
						await config.hooks.onAfterUpdate(serialized, context);
					}

					return serializeContentItemWithType(updated);
				},
			);

			const deleteContentItem = createEndpoint(
				"/content/:typeSlug/:id",
				{
					method: "DELETE",
					params: z.object({ typeSlug: z.string(), id: z.string() }),
				},
				async (ctx) => {
					const { typeSlug, id } = ctx.params;
					const context = createContext(typeSlug, ctx.headers);

					const contentType = await getContentType(typeSlug);
					if (!contentType) {
						throw ctx.error(404, { message: "Content type not found" });
					}

					const existing = await adapter.findOne<ContentItem>({
						model: "contentItem",
						where: [{ field: "id", value: id, operator: "eq" as const }],
					});

					if (!existing || existing.contentTypeId !== contentType.id) {
						throw ctx.error(404, { message: "Content item not found" });
					}

					// Call before hook
					if (config.hooks?.onBeforeDelete) {
						const canDelete = await config.hooks.onBeforeDelete(id, context);
						if (!canDelete) {
							throw ctx.error(403, { message: "Delete operation denied" });
						}
					}

					await adapter.delete({
						model: "contentItem",
						where: [{ field: "id", value: id, operator: "eq" as const }],
					});

					// Call after hook
					if (config.hooks?.onAfterDelete) {
						await config.hooks.onAfterDelete(id, context);
					}

					return { success: true };
				},
			);

			// ========== Relation Endpoints ==========

			const getContentItemPopulated = createEndpoint(
				"/content/:typeSlug/:id/populated",
				{
					method: "GET",
					params: z.object({ typeSlug: z.string(), id: z.string() }),
				},
				async (ctx) => {
					const { typeSlug, id } = ctx.params;

					const contentType = await getContentType(typeSlug);
					if (!contentType) {
						throw ctx.error(404, { message: "Content type not found" });
					}

					const item = await adapter.findOne<ContentItemWithType>({
						model: "contentItem",
						where: [{ field: "id", value: id, operator: "eq" as const }],
						join: { contentType: true },
					});

					if (!item || item.contentTypeId !== contentType.id) {
						throw ctx.error(404, { message: "Content item not found" });
					}

					// Populate relations
					const _relations = await populateRelations(adapter, item);

					return {
						...serializeContentItemWithType(item),
						_relations,
					};
				},
			);

			const listContentByRelation = createEndpoint(
				"/content/:typeSlug/by-relation",
				{
					method: "GET",
					params: z.object({ typeSlug: z.string() }),
					query: z.object({
						field: z.string(),
						targetId: z.string(),
						limit: z.coerce.number().min(1).max(100).optional().default(20),
						offset: z.coerce.number().min(0).optional().default(0),
					}),
				},
				async (ctx) => {
					const { typeSlug } = ctx.params;
					const { field, targetId, limit, offset } = ctx.query;

					const contentType = await getContentType(typeSlug);
					if (!contentType) {
						throw ctx.error(404, { message: "Content type not found" });
					}

					// Find all content relations where the target matches
					const contentRelations = await adapter.findMany<ContentRelation>({
						model: "contentRelation",
						where: [
							{ field: "targetId", value: targetId, operator: "eq" as const },
							{ field: "fieldName", value: field, operator: "eq" as const },
						],
					});

					// Get unique source IDs that belong to this content type
					const sourceIds = [
						...new Set(contentRelations.map((r) => r.sourceId)),
					];

					if (sourceIds.length === 0) {
						return {
							items: [],
							total: 0,
							limit,
							offset,
						};
					}

					// Fetch all matching items (filtering by content type)
					const allItems: ContentItemWithType[] = [];
					for (const sourceId of sourceIds) {
						const item = await adapter.findOne<ContentItemWithType>({
							model: "contentItem",
							where: [
								{ field: "id", value: sourceId, operator: "eq" as const },
								{
									field: "contentTypeId",
									value: contentType.id,
									operator: "eq" as const,
								},
							],
							join: { contentType: true },
						});
						if (item) {
							allItems.push(item);
						}
					}

					// Sort by createdAt desc
					allItems.sort(
						(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
					);

					const total = allItems.length;
					const paginatedItems = allItems.slice(offset, offset + limit);

					return {
						items: paginatedItems.map(serializeContentItemWithType),
						total,
						limit,
						offset,
					};
				},
			);

			// ========== Inverse Relation Endpoints ==========

			const getInverseRelations = createEndpoint(
				"/content-types/:slug/inverse-relations",
				{
					method: "GET",
					params: z.object({ slug: z.string() }),
					query: z.object({
						itemId: z.string().optional(),
					}),
				},
				async (ctx) => {
					const { slug } = ctx.params;
					const { itemId } = ctx.query;

					await ensureSynced(adapter);

					// Get the target content type
					const targetContentType = await getContentType(slug);
					if (!targetContentType) {
						throw ctx.error(404, { message: "Content type not found" });
					}

					// Find all content types that have belongsTo relations pointing to this type
					const allContentTypes = await adapter.findMany<ContentType>({
						model: "contentType",
					});

					const inverseRelations: InverseRelation[] = [];

					for (const contentType of allContentTypes) {
						const relationFields = extractRelationFields(contentType);

						for (const [fieldName, relationConfig] of Object.entries(
							relationFields,
						)) {
							// Only include belongsTo relations that point to the target type
							if (
								relationConfig.type === "belongsTo" &&
								relationConfig.targetType === slug
							) {
								let count = 0;

								// If itemId is provided, count items that reference this specific item
								if (itemId) {
									const relations = await adapter.findMany<ContentRelation>({
										model: "contentRelation",
										where: [
											{
												field: "targetId",
												value: itemId,
												operator: "eq" as const,
											},
											{
												field: "fieldName",
												value: fieldName,
												operator: "eq" as const,
											},
										],
									});
									// Filter to only include relations from this content type
									const itemIds = relations.map((r) => r.sourceId);
									for (const sourceId of itemIds) {
										const item = await adapter.findOne<ContentItem>({
											model: "contentItem",
											where: [
												{
													field: "id",
													value: sourceId,
													operator: "eq" as const,
												},
												{
													field: "contentTypeId",
													value: contentType.id,
													operator: "eq" as const,
												},
											],
										});
										if (item) count++;
									}
								}

								inverseRelations.push({
									sourceType: contentType.slug,
									sourceTypeName: contentType.name,
									fieldName,
									count,
								});
							}
						}
					}

					return { inverseRelations };
				},
			);

			const listInverseRelationItems = createEndpoint(
				"/content-types/:slug/inverse-relations/:sourceType",
				{
					method: "GET",
					params: z.object({
						slug: z.string(),
						sourceType: z.string(),
					}),
					query: z.object({
						itemId: z.string(),
						fieldName: z.string(),
						limit: z.coerce.number().min(1).max(100).optional().default(20),
						offset: z.coerce.number().min(0).optional().default(0),
					}),
				},
				async (ctx) => {
					const { slug, sourceType } = ctx.params;
					const { itemId, fieldName, limit, offset } = ctx.query;

					await ensureSynced(adapter);

					// Verify target content type exists
					const targetContentType = await getContentType(slug);
					if (!targetContentType) {
						throw ctx.error(404, { message: "Target content type not found" });
					}

					// Verify source content type exists
					const sourceContentType = await getContentType(sourceType);
					if (!sourceContentType) {
						throw ctx.error(404, { message: "Source content type not found" });
					}

					// Find all relations pointing to this item
					const relations = await adapter.findMany<ContentRelation>({
						model: "contentRelation",
						where: [
							{ field: "targetId", value: itemId, operator: "eq" as const },
							{ field: "fieldName", value: fieldName, operator: "eq" as const },
						],
					});

					// Get unique source IDs
					const sourceIds = [...new Set(relations.map((r) => r.sourceId))];

					// Fetch all matching items from the source content type
					const allItems: ContentItemWithType[] = [];
					for (const sourceId of sourceIds) {
						const item = await adapter.findOne<ContentItemWithType>({
							model: "contentItem",
							where: [
								{ field: "id", value: sourceId, operator: "eq" as const },
								{
									field: "contentTypeId",
									value: sourceContentType.id,
									operator: "eq" as const,
								},
							],
							join: { contentType: true },
						});
						if (item) {
							allItems.push(item);
						}
					}

					// Sort by createdAt desc
					allItems.sort(
						(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
					);

					const total = allItems.length;
					const paginatedItems = allItems.slice(offset, offset + limit);

					return {
						items: paginatedItems.map(serializeContentItemWithType),
						total,
						limit,
						offset,
					};
				},
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
			};
		},
	});
};

export type CMSApiRouter = ReturnType<
	ReturnType<typeof cmsBackendPlugin>["routes"]
>;
