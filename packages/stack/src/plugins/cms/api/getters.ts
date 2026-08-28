import type { DBAdapter as Adapter } from "@btst/db";
import { DEFAULT_MAX_PAGE_SIZE } from "../schemas";
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
 * Throws a SyntaxError if `item.data` is not valid JSON, so corrupted rows
 * produce a visible, debuggable error rather than silently returning null.
 */
export function serializeContentItemWithType(
	item: ContentItemWithType,
): SerializedContentItemWithType {
	const parsedData = JSON.parse(item.data) as Record<string, unknown>;
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
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT called. The caller is
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
 * Case-insensitive substring match against an item's slug and the string
 * values of its parsed data (one level deep — nested objects/arrays of
 * primitives are scanned, deeper structures are skipped).
 */
function contentItemMatchesSearch(
	item: SerializedContentItemWithType,
	searchLower: string,
): boolean {
	if (item.slug.toLowerCase().includes(searchLower)) return true;

	const matchesValue = (value: unknown): boolean =>
		typeof value === "string" && value.toLowerCase().includes(searchLower);

	return Object.values(item.parsedData).some((value) => {
		if (matchesValue(value)) return true;
		if (Array.isArray(value)) return value.some(matchesValue);
		if (typeof value === "object" && value !== null) {
			return Object.values(value).some(matchesValue);
		}
		return false;
	});
}

/**
 * Retrieve all content items for a given content type, with optional pagination
 * and free-text search.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param contentTypeSlug - The slug of the content type to query
 * @param params - Optional filter/pagination parameters. `search` matches
 * case-insensitively against item slugs and string values in the item data.
 */
export async function getAllContentItems(
	adapter: Adapter,
	contentTypeSlug: string,
	params?: { slug?: string; limit?: number; offset?: number; search?: string },
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

	// Free-text search must remain in-memory: item data is stored as a JSON
	// string, so the adapter cannot match individual field values. All other
	// filters above are pushed to DB; when searching, pagination happens
	// after the in-memory pass so `total` reflects the filtered set.
	// The DB scan is capped at DEFAULT_MAX_PAGE_SIZE to bound memory use;
	// items beyond the cap are not searched.
	const search = params?.search?.trim();
	const needsInMemoryFilter = !!search;

	// TODO: remove cast once @btst/db types expose adapter.count()
	const dbTotal: number | undefined = !needsInMemoryFilter
		? await adapter.count({
				model: "contentItem",
				where: whereConditions,
			})
		: undefined;

	const items = await adapter.findMany<ContentItemWithType>({
		model: "contentItem",
		where: whereConditions,
		limit: !needsInMemoryFilter ? params?.limit : DEFAULT_MAX_PAGE_SIZE,
		offset: !needsInMemoryFilter ? params?.offset : undefined,
		sortBy: { field: "createdAt", direction: "desc" },
		join: { contentType: true },
	});

	let result = items.map(serializeContentItemWithType);

	if (needsInMemoryFilter) {
		const searchLower = search.toLowerCase();
		result = result.filter((item) =>
			contentItemMatchesSearch(item, searchLower),
		);

		const total = result.length;
		const offset = params?.offset ?? 0;
		const limit = params?.limit;
		result = result.slice(
			offset,
			limit !== undefined ? offset + limit : undefined,
		);
		return {
			items: result,
			total,
			limit: params?.limit,
			offset: params?.offset,
		};
	}

	return {
		items: result,
		total: dbTotal ?? result.length,
		limit: params?.limit,
		offset: params?.offset,
	};
}

/**
 * Retrieve a single content item by its ID.
 * Returns null if the item is not found.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 * @param id - The content item ID (UUID)
 */
export async function getContentItemById(
	adapter: Adapter,
	id: string,
): Promise<SerializedContentItemWithType | null> {
	const item = await adapter.findOne<ContentItemWithType>({
		model: "contentItem",
		where: [{ field: "id", value: id, operator: "eq" as const }],
		join: { contentType: true },
	});
	if (!item) return null;
	return serializeContentItemWithType(item);
}

/**
 * Retrieve a single content item by its slug within a content type.
 * Returns null if the content type or item is not found.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Operation authorization and lifecycle hooks are NOT called. The caller is
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
