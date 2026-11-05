import type { Post, Tag, SerializedPost, SerializedTag } from "../types";

/**
 * Serialize a Tag for SSR/SSG use (convert dates to strings).
 * Pure function — no DB access, no hooks.
 */
export function serializeTag(tag: Tag): SerializedTag {
	return {
		...tag,
		createdAt: tag.createdAt.toISOString(),
		updatedAt: tag.updatedAt.toISOString(),
	};
}

/**
 * Serialize a Post (with tags) for SSR/SSG use (convert dates to strings).
 * Pure function — no DB access, no hooks.
 */
export function serializePost(post: Post & { tags: Tag[] }): SerializedPost {
	return {
		...post,
		createdAt: post.createdAt.toISOString(),
		updatedAt: post.updatedAt.toISOString(),
		publishedAt: post.publishedAt?.toISOString(),
		tags: post.tags.map(serializeTag),
	};
}
