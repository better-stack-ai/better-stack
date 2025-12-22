import type { Adapter } from "@btst/db";
import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import { cmsSchema as dbSchema } from "../db";
import type {
	ContentType,
	ContentItem,
	ContentItemWithType,
	CMSBackendConfig,
	CMSHookContext,
	SerializedContentType,
	SerializedContentItem,
	SerializedContentItemWithType,
} from "../types";
import { listContentQuerySchema } from "../schemas";
import { slugify } from "../utils";

/**
 * Migrate a legacy JSON Schema (version 1) to unified format (version 2)
 * by merging fieldConfig values into the JSON Schema properties
 */
function migrateToUnifiedSchema(
	jsonSchemaStr: string,
	fieldConfigStr: string | null | undefined,
): string {
	if (!fieldConfigStr) {
		return jsonSchemaStr;
	}

	try {
		const jsonSchema = JSON.parse(jsonSchemaStr);
		const fieldConfig = JSON.parse(fieldConfigStr);

		if (!jsonSchema.properties || typeof fieldConfig !== "object") {
			return jsonSchemaStr;
		}

		// Merge fieldType from fieldConfig into each property
		for (const [key, config] of Object.entries(fieldConfig)) {
			if (
				jsonSchema.properties[key] &&
				typeof config === "object" &&
				config !== null &&
				"fieldType" in config
			) {
				jsonSchema.properties[key].fieldType = (
					config as { fieldType: string }
				).fieldType;
			}
		}

		return JSON.stringify(jsonSchema);
	} catch {
		// If parsing fails, return original
		return jsonSchemaStr;
	}
}

/**
 * Serialize a ContentType for API response (convert dates to strings)
 * Also applies lazy migration for legacy schemas (version 1 → 2)
 */
function serializeContentType(ct: ContentType): SerializedContentType {
	// Check if this is a legacy schema that needs migration
	const needsMigration = !ct.autoFormVersion || ct.autoFormVersion < 2;

	// Apply lazy migration: merge fieldConfig into jsonSchema on read
	const migratedJsonSchema = needsMigration
		? migrateToUnifiedSchema(ct.jsonSchema, ct.fieldConfig)
		: ct.jsonSchema;

	return {
		id: ct.id,
		name: ct.name,
		slug: ct.slug,
		description: ct.description,
		jsonSchema: migratedJsonSchema,
		createdAt: ct.createdAt.toISOString(),
		updatedAt: ct.updatedAt.toISOString(),
	};
}

/**
 * Serialize a ContentItem for API response (convert dates to strings)
 */
function serializeContentItem(item: ContentItem): SerializedContentItem {
	return {
		...item,
		createdAt: item.createdAt.toISOString(),
		updatedAt: item.updatedAt.toISOString(),
	};
}

/**
 * Serialize a ContentItem with parsed data and joined ContentType
 */
function serializeContentItemWithType(
	item: ContentItemWithType,
): SerializedContentItemWithType {
	return {
		...serializeContentItem(item),
		parsedData: JSON.parse(item.data),
		contentType: item.contentType
			? serializeContentType(item.contentType)
			: undefined,
	};
}

/**
 * Sync content types from config to database
 * Creates or updates content types based on the developer's Zod schemas
 *
 * Handles race conditions from multiple instances by catching unique constraint
 * errors and verifying the record exists (another instance created it first).
 */
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
		// Convert Zod schema to JSON Schema - fieldType is now embedded via .meta()
		const jsonSchema = JSON.stringify(z.toJSONSchema(ct.schema));

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
 * Uses Zod v4's native z.fromJSONSchema() for conversion
 */
function getContentTypeZodSchema(contentType: ContentType): z.ZodTypeAny {
	const jsonSchema = JSON.parse(contentType.jsonSchema);
	return z.fromJSONSchema(jsonSchema);
}

/**
 * CMS backend plugin
 * Provides API endpoints for managing content types and content items
 *
 * @param config - Configuration with content types and optional hooks
 */
export const cmsBackendPlugin = (config: CMSBackendConfig) =>
	defineBackendPlugin({
		name: "cms",

		dbPlugin: dbSchema,

		routes: (adapter: Adapter) => {
			// Sync content types on first request using promise-based lock
			// This prevents race conditions when multiple concurrent requests arrive
			// on cold start within the same instance
			let syncPromise: Promise<void> | null = null;

			const ensureSynced = async () => {
				if (!syncPromise) {
					syncPromise = syncContentTypes(adapter, config).catch((err) => {
						// If sync fails, allow retry on next request
						syncPromise = null;
						throw err;
					});
				}
				await syncPromise;
			};

			// Helper to get content type by slug
			const getContentType = async (
				slug: string,
			): Promise<ContentType | null> => {
				await ensureSynced();
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
					await ensureSynced();

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

					const whereConditions = [
						{
							field: "contentTypeId",
							value: contentType.id,
							operator: "eq" as const,
						},
					];

					if (slug) {
						whereConditions.push({
							field: "slug",
							value: slug,
							operator: "eq" as const,
						});
					}

					// Get total count
					const allItems = await adapter.findMany<ContentItem>({
						model: "contentItem",
						where: whereConditions,
					});
					const total = allItems.length;

					// Get paginated items
					const items = await adapter.findMany<ContentItemWithType>({
						model: "contentItem",
						where: whereConditions,
						limit,
						offset,
						sortBy: { field: "createdAt", direction: "desc" },
						join: { contentType: true },
					});

					return {
						items: items.map(serializeContentItemWithType),
						total,
						limit,
						offset,
					};
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

					// Validate data against content type schema
					const zodSchema = getContentTypeZodSchema(contentType);
					const validation = zodSchema.safeParse(data);
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

					// Call before hook - may modify data or deny operation
					let finalData = validation.data;
					if (config.hooks?.onBeforeCreate) {
						const result = await config.hooks.onBeforeCreate(
							validation.data as Record<string, unknown>,
							context,
						);
						if (result === false) {
							throw ctx.error(403, { message: "Create operation denied" });
						}
						// Use returned data if provided (hook can modify data)
						if (result && typeof result === "object") {
							finalData = result;
						}
					}

					const item = await adapter.create<ContentItem>({
						model: "contentItem",
						data: {
							contentTypeId: contentType.id,
							slug,
							data: JSON.stringify(finalData),
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});

					const serialized = serializeContentItem(item);

					// Call after hook
					if (config.hooks?.onAfterCreate) {
						await config.hooks.onAfterCreate(serialized, context);
					}

					return {
						...serialized,
						parsedData: finalData,
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

					// Validate data if provided
					let validatedData = data;
					if (data) {
						const zodSchema = getContentTypeZodSchema(contentType);
						const validation = zodSchema.safeParse(data);
						if (!validation.success) {
							throw ctx.error(400, {
								message: "Validation failed",
								errors: validation.error.issues,
							});
						}
						validatedData = validation.data as Record<string, unknown>;
					}

					// Call before hook - may modify data or deny operation
					let finalData = validatedData;
					if (config.hooks?.onBeforeUpdate && validatedData) {
						const result = await config.hooks.onBeforeUpdate(
							id,
							validatedData,
							context,
						);
						if (result === false) {
							throw ctx.error(403, { message: "Update operation denied" });
						}
						// Use returned data if provided (hook can modify data)
						if (result && typeof result === "object") {
							finalData = result;
						}
					}

					const updateData: Partial<ContentItem> = {
						updatedAt: new Date(),
					};
					if (slug) updateData.slug = slug;
					if (finalData) updateData.data = JSON.stringify(finalData);

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

			return {
				listContentTypes,
				getContentTypeBySlug,
				listContentItems,
				getContentItem,
				createContentItem,
				updateContentItem,
				deleteContentItem,
			};
		},
	});

export type CMSApiRouter = ReturnType<
	ReturnType<typeof cmsBackendPlugin>["routes"]
>;
