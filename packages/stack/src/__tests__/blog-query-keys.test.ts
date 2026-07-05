/**
 * SSG guard: the factory-generated blog query keys must stay deep-equal to
 * the `BLOG_QUERY_KEYS` builders used by `prefetchForRoute` (DB path).
 * Key drift breaks React Query cache hydration silently during `next build`.
 */
import { describe, expect, it, vi } from "vitest";
import { BLOG_QUERY_KEYS } from "../plugins/blog/api/query-key-defs";
import { createBlogQueryKeys } from "../plugins/blog/query-keys";

const client = vi.fn() as any;

describe("blog query keys match SSG prefetch keys", () => {
	const queries = createBlogQueryKeys(client);

	it("posts list keys match for default params", () => {
		expect([...queries.posts.list({ published: true }).queryKey]).toEqual([
			...BLOG_QUERY_KEYS.postsList({ published: true }),
		]);
	});

	it("posts list keys match for drafts and custom limits", () => {
		expect([
			...queries.posts.list({ published: false, limit: 25 }).queryKey,
		]).toEqual([...BLOG_QUERY_KEYS.postsList({ published: false, limit: 25 })]);
	});

	it("posts list keys match for tag filtering", () => {
		expect([
			...queries.posts.list({ published: true, tagSlug: "news" }).queryKey,
		]).toEqual([
			...BLOG_QUERY_KEYS.postsList({ published: true, tagSlug: "news" }),
		]);
	});

	it("posts list defaults published to true like the SSR loader", () => {
		expect([...queries.posts.list().queryKey]).toEqual([
			...BLOG_QUERY_KEYS.postsList({ published: true }),
		]);
	});

	it("normalizes a whitespace-only query the same way", () => {
		expect([
			...queries.posts.list({ published: true, query: "  " }).queryKey,
		]).toEqual([...BLOG_QUERY_KEYS.postsList({ published: true })]);
	});

	it("post detail keys match", () => {
		expect([...queries.posts.detail("my-post").queryKey]).toEqual([
			...BLOG_QUERY_KEYS.postDetail("my-post"),
		]);
	});

	it("tags list keys match", () => {
		expect([...queries.tags.list().queryKey]).toEqual([
			...BLOG_QUERY_KEYS.tagsList(),
		]);
	});

	it("exposes the same _def prefixes as the previous factory", () => {
		expect([...queries.posts._def]).toEqual(["posts"]);
		expect([...queries.posts.list._def]).toEqual(["posts", "list"]);
		expect([...queries.drafts.list._def]).toEqual(["drafts", "list"]);
	});

	it("drafts list keys keep the legacy limit-only shape", () => {
		expect([...queries.drafts.list({ limit: 10 }).queryKey]).toEqual([
			"drafts",
			"list",
			{ limit: 10 },
		]);
		expect([...queries.drafts.list().queryKey]).toEqual(["drafts", "list", {}]);
	});

	it("bespoke nextPrevious and recent keys keep their legacy shapes", () => {
		const date = new Date("2024-01-01T00:00:00.000Z");
		expect([...queries.posts.nextPrevious(date).queryKey]).toEqual([
			"posts",
			"nextPrevious",
			"nextPrevious",
			date,
		]);
		expect([
			...queries.posts.recent({ limit: 5, excludeSlug: "a" }).queryKey,
		]).toEqual(["posts", "recent", "recent", { limit: 5, excludeSlug: "a" }]);
	});
});
