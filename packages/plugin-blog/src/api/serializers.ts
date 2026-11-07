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
	const {
		editorialEnabled: _enabled,
		editorialVersion: _version,
		editorialStatus: _status,
		editorialSubmittedRevisionId: _submitted,
		editorialApprovedRevisionId: _approved,
		editorialLiveRevisionId: _live,
		editorialLiveSlug: _liveSlug,
		editorialActorId: _actor,
		editorialUpdatedAt: _updated,
		editorialComment: _comment,
		...publicPost
	} = post;
	return {
		...publicPost,
		createdAt: post.createdAt.toISOString(),
		updatedAt: post.updatedAt.toISOString(),
		publishedAt: post.publishedAt?.toISOString(),
		tags: post.tags.map(serializeTag),
	};
}
