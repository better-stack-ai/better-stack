import type { DBAdapter as Adapter } from "@btst/db";
import type { ContentType, ContentItem } from "../types";
import { serializeContentItem } from "./getters";
import type { SerializedContentItem } from "../types";
import {
	collectExistingRelationIds,
	extractRelationFields,
	syncRelations,
} from "./relations";

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
 * Options for {@link createCMSContentItem}.
 */
export interface CreateCMSContentItemOptions {
	/**
	 * When `true`, persist relation fields (`belongsTo`, `hasMany`,
	 * `manyToMany`) into the `contentRelation` junction table in addition to
	 * the item's JSON payload.
	 *
	 * This is what the HTTP `POST /content/:typeSlug` route does, and is
	 * required for the admin "Related Items" panel / inverse-relation queries
	 * to find the item.
	 *
	 * Seeds and other programmatic callers that want the admin UI to work
	 * should enable this flag. Callers are still expected to pass
	 * pre-created target IDs (`{ id }` or `[{ id }, ...]`) — inline `_new`
	 * creation is only supported via the HTTP route.
	 *
	 * Defaults to `false` for backwards compatibility (a no-op for content
	 * types without relations).
	 */
	syncRelations?: boolean;
}

/**
 * Create a new content item for a content type (looked up by slug).
 *
 * Bypasses Zod schema validation and inline `_new` relation creation — the
 * caller is responsible for providing valid data and pre-created relation
 * IDs. For schema validation or inline creation of related items, use the
 * HTTP endpoint instead.
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
 * @param options - See {@link CreateCMSContentItemOptions}. Pass
 *   `{ syncRelations: true }` to also populate the `contentRelation`
 *   junction table for relation fields in the payload.
 */
export async function createCMSContentItem(
	adapter: Adapter,
	contentTypeSlug: string,
	input: CreateCMSContentItemInput,
	options: CreateCMSContentItemOptions = {},
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

	if (options.syncRelations) {
		const relationFields = extractRelationFields(contentType);
		if (Object.keys(relationFields).length > 0) {
			const relationIds = collectExistingRelationIds(
				input.data,
				relationFields,
			);
			await syncRelations(adapter, item.id, relationIds);
		}
	}

	return serializeContentItem(item);
}
