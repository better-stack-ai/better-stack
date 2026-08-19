/**
 * SSG guard: the factory-generated comments query keys must stay deep-equal
 * to the `COMMENTS_QUERY_KEYS` builders (and their shared discriminators)
 * used by loader/SSG prefetch paths. Key drift breaks React Query cache
 * hydration silently.
 */
import { describe, expect, it, vi } from "vitest";
import {
	COMMENTS_QUERY_KEYS,
	commentCountDiscriminator,
} from "../plugins/comments/api/query-key-defs";
import { createCommentsQueryKeys } from "../plugins/comments/query-keys";

const client = vi.fn() as any;

describe("comments query keys match SSG prefetch keys", () => {
	const queries = createCommentsQueryKeys(client);

	it("comments list keys match for default params", () => {
		expect([...queries.comments.list({}).queryKey]).toEqual([
			...COMMENTS_QUERY_KEYS.commentsList({}),
		]);
	});

	it("comments list keys match the moderation loader prefetch key", () => {
		const params = { status: "pending" as const, limit: 20, offset: 0 };
		expect([...queries.comments.list(params).queryKey]).toEqual([
			...COMMENTS_QUERY_KEYS.commentsList(params),
		]);
	});

	it("comments list keys match the user-comments loader prefetch key", () => {
		const params = {
			authorId: "user-1",
			sort: "desc" as const,
			limit: 20,
			offset: 0,
		};
		expect([...queries.comments.list(params).queryKey]).toEqual([
			...COMMENTS_QUERY_KEYS.commentsList(params),
		]);
	});

	it("distinguishes parentId null from undefined (separate cache entries)", () => {
		const withNull = queries.comments.list({ parentId: null }).queryKey;
		const withUndefined = queries.comments.list({}).queryKey;
		expect([...withNull]).toEqual([
			...COMMENTS_QUERY_KEYS.commentsList({ parentId: null }),
		]);
		expect(withNull).not.toEqual(withUndefined);
	});

	it("segregates caches per currentUserId without leaking it to the key builders", () => {
		const params = {
			resourceId: "post-1",
			resourceType: "post",
			currentUserId: "user-9",
		};
		expect([...queries.comments.list(params).queryKey]).toEqual([
			...COMMENTS_QUERY_KEYS.commentsList(params),
		]);
	});

	it("thread keys match and exclude offset (pageParam-driven)", () => {
		const params = {
			resourceId: "post-1",
			resourceType: "post",
			parentId: null,
			status: "approved" as const,
			sort: "asc" as const,
			limit: 10,
		};
		expect([...queries.commentsThread.list(params).queryKey]).toEqual([
			...COMMENTS_QUERY_KEYS.commentsThread(params),
		]);
	});

	it("count keys use the shared discriminator", () => {
		// Note: COMMENTS_QUERY_KEYS.commentCount uses the ["comments", "count"]
		// prefix while the runtime factory has always used
		// ["commentCount", "byResource"] — a pre-existing divergence. The
		// discriminator cell (the part that actually varies) must stay shared.
		const params = { resourceId: "post-1", resourceType: "post" };
		expect([...queries.commentCount.byResource(params).queryKey]).toEqual([
			"commentCount",
			"byResource",
			commentCountDiscriminator(params),
		]);
		expect(COMMENTS_QUERY_KEYS.commentCount(params)[2]).toEqual(
			commentCountDiscriminator(params),
		);
	});

	it("exposes the same _def prefixes as the previous factory", () => {
		expect([...queries.comments._def]).toEqual(["comments"]);
		expect([...queries.comments.list._def]).toEqual(["comments", "list"]);
		expect([...queries.commentCount._def]).toEqual(["commentCount"]);
		expect([...queries.commentCount.byResource._def]).toEqual([
			"commentCount",
			"byResource",
		]);
		expect([...queries.commentsThread._def]).toEqual(["commentsThread"]);
		expect([...queries.commentsThread.list._def]).toEqual([
			"commentsThread",
			"list",
		]);
	});
});
