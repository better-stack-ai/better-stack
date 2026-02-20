import type { Adapter } from "@btst/db";
import type {
	ContentType,
	ContentItem,
	ContentItemWithType,
	SerializedContentType,
	SerializedContentItem,
	SerializedContentItemWithType,
} from "../types";

/**
 * Serialize a ContentType for SSR/SSG use (convert dates to strings).
 * Applies lazy migration for legacy schemas (version 1 → 2).
 */
export function serializeContentType(ct: ContentType): SerializedContentType {
	const needsMigration = !ct.autoFormVersion || ct.autoFormVersion < 2;
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

export function migrateToUnifiedSchema(
	jsonSchemaStr: string,
	fieldConfigStr: string | null | undefined,
): string {
	if (!fieldConfigStr) return jsonSchemaStr;
	try {
		const jsonSchema = JSON.parse(jsonSchemaStr);
		const fieldConfig = JSON.parse(fieldConfigStr);
		if (!jsonSchema.properties || typeof fieldConfig !== "object") {
			return jsonSchemaStr;
		}
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
		return jsonSchemaStr;
	}
}

/**
 * Serialize a ContentItem for SSR/SSG use (convert dates to strings).
 */
export function serializeContentItem(item: ContentItem): SerializedContentItem {
	return {
		...item,
		createdAt: item.createdAt.toISOString(),
		updatedAt: item.updatedAt.toISOString(),
	};
}

/**
 * Serialize a ContentItem with parsed data and joined ContentType.
 * If `item.data` is corrupted JSON, `parsedData` is set to `null` rather than
 * throwing, so one bad row cannot crash the entire list or SSG build.
 */
export function serializeContentItemWithType(
	item: ContentItemWithType,
): SerializedContentItemWithType {
	let parsedData: Record<string, unknown> | null = null;
	try {
		parsedData = JSON.parse(item.data);
	} catch {
		// Corrupted JSON — leave parsedData as null so callers can handle it
	}
	return {
		...serializeContentItem(item),
		parsedData,
		contentType: item.contentType
			? serializeContentType(item.contentType)
			: undefined,
	};
}

/**
 * Retrieve all content types.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 */
export async function getAllContentTypes(
	adapter: Adapter,
): Promise<SerializedContentType[]> {
	const contentTypes = await adapter.findMany<ContentType>({
		model: "contentType",
		sortBy: { field: "name", direction: "asc" },
	});
	return contentTypes.map(serializeContentType);
}

/**
 * Retrieve all content items for a given content type, with optional pagination.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks (e.g. `onBeforeListItems`) are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param contentTypeSlug - The slug of the content type to query
 * @param params - Optional filter/pagination parameters
 */
export async function getAllContentItems(
	adapter: Adapter,
	contentTypeSlug: string,
	params?: { slug?: string; limit?: number; offset?: number },
): Promise<{
	items: SerializedContentItemWithType[];
	total: number;
	limit?: number;
	offset?: number;
}> {
	const contentType = await adapter.findOne<ContentType>({
		model: "contentType",
		where: [
			{
				field: "slug",
				value: contentTypeSlug,
				operator: "eq" as const,
			},
		],
	});

	if (!contentType) {
		return {
			items: [],
			total: 0,
			limit: params?.limit,
			offset: params?.offset,
		};
	}

	const whereConditions: Array<{
		field: string;
		value: string;
		operator: "eq";
	}> = [
		{
			field: "contentTypeId",
			value: contentType.id,
			operator: "eq" as const,
		},
	];

	if (params?.slug) {
		whereConditions.push({
			field: "slug",
			value: params.slug,
			operator: "eq" as const,
		});
	}

	// TODO: remove cast once @btst/db types expose adapter.count()
	const total: number = await adapter.count({
		model: "contentItem",
		where: whereConditions,
	});

	const items = await adapter.findMany<ContentItemWithType>({
		model: "contentItem",
		where: whereConditions,
		limit: params?.limit,
		offset: params?.offset,
		sortBy: { field: "createdAt", direction: "desc" },
		join: { contentType: true },
	});

	return {
		items: items.map(serializeContentItemWithType),
		total,
		limit: params?.limit,
		offset: params?.offset,
	};
}

/**
 * Retrieve a single content item by its slug within a content type.
 * Returns null if the content type or item is not found.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 * @param contentTypeSlug - The slug of the content type
 * @param slug - The slug of the content item
 */
export async function getContentItemBySlug(
	adapter: Adapter,
	contentTypeSlug: string,
	slug: string,
): Promise<SerializedContentItemWithType | null> {
	const contentType = await adapter.findOne<ContentType>({
		model: "contentType",
		where: [
			{
				field: "slug",
				value: contentTypeSlug,
				operator: "eq" as const,
			},
		],
	});

	if (!contentType) {
		return null;
	}

	const item = await adapter.findOne<ContentItemWithType>({
		model: "contentItem",
		where: [
			{
				field: "contentTypeId",
				value: contentType.id,
				operator: "eq" as const,
			},
			{ field: "slug", value: slug, operator: "eq" as const },
		],
		join: { contentType: true },
	});

	if (!item) {
		return null;
	}

	return serializeContentItemWithType(item);
}
