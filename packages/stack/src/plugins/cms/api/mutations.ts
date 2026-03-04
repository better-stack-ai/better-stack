import type { Adapter } from "@btst/db";
import type { ContentType, ContentItem } from "../types";
import { serializeContentItem } from "./getters";
import type { SerializedContentItem } from "../types";

/**
 * Input for creating a new CMS content item.
 */
export interface CreateCMSContentItemInput {
	/** URL-safe slug for the item */
	slug: string;
	/** Arbitrary data payload — should match the content type schema */
	data: Record<string, unknown>;
}

/**
 * Create a new content item for a content type (looked up by slug).
 *
 * Bypasses Zod schema validation and relation processing — the caller is
 * responsible for providing valid, relation-free data. For relation fields or
 * schema validation, use the HTTP endpoint instead.
 *
 * Throws if the content type is not found or the slug is already taken within
 * that content type.
 *
 * @remarks **Security:** No authorization hooks (`onBeforeCreate`, `onAfterCreate`)
 * are called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param contentTypeSlug - Slug of the target content type
 * @param input - Item slug and data payload
 */
export async function createCMSContentItem(
	adapter: Adapter,
	contentTypeSlug: string,
	input: CreateCMSContentItemInput,
): Promise<SerializedContentItem> {
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
		throw new Error(`Content type "${contentTypeSlug}" not found`);
	}

	const existing = await adapter.findOne<ContentItem>({
		model: "contentItem",
		where: [
			{
				field: "contentTypeId",
				value: contentType.id,
				operator: "eq" as const,
			},
			{ field: "slug", value: input.slug, operator: "eq" as const },
		],
	});

	if (existing) {
		throw new Error(
			`Content item with slug "${input.slug}" already exists in type "${contentTypeSlug}"`,
		);
	}

	const item = await adapter.create<ContentItem>({
		model: "contentItem",
		data: {
			contentTypeId: contentType.id,
			slug: input.slug,
			data: JSON.stringify(input.data),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});

	return serializeContentItem(item);
}
