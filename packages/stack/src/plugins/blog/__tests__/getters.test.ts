import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { Adapter } from "@btst/db";
import { blogSchema } from "../db";
import { getAllPosts, getPostBySlug, getAllTags } from "../api/getters";

const createTestAdapter = (): Adapter => {
	const db = defineDb({}).use(blogSchema);
	return createMemoryAdapter(db)({});
};

describe("blog getters", () => {
	let adapter: Adapter;

	beforeEach(() => {
		adapter = createTestAdapter();
	});

	describe("getAllPosts", () => {
		it("returns empty result when no posts exist", async () => {
			const result = await getAllPosts(adapter);
			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("returns all posts with empty tags array", async () => {
			await adapter.create({
				model: "post",
				data: {
					title: "Hello World",
					slug: "hello-world",
					content: "Content here",
					excerpt: "Excerpt",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const result = await getAllPosts(adapter);
			expect(result.items).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(result.items[0]!.slug).toBe("hello-world");
			expect(result.items[0]!.tags).toEqual([]);
		});

		it("filters posts by published status", async () => {
			await adapter.create({
				model: "post",
				data: {
					title: "Published Post",
					slug: "published",
					content: "Content",
					excerpt: "",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "post",
				data: {
					title: "Draft Post",
					slug: "draft",
					content: "Content",
					excerpt: "",
					published: false,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const published = await getAllPosts(adapter, { published: true });
			expect(published.items).toHaveLength(1);
			expect(published.total).toBe(1);
			expect(published.items[0]!.slug).toBe("published");

			const drafts = await getAllPosts(adapter, { published: false });
			expect(drafts.items).toHaveLength(1);
			expect(drafts.total).toBe(1);
			expect(drafts.items[0]!.slug).toBe("draft");
		});

		it("filters posts by slug", async () => {
			await adapter.create({
				model: "post",
				data: {
					title: "Post A",
					slug: "post-a",
					content: "Content",
					excerpt: "",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "post",
				data: {
					title: "Post B",
					slug: "post-b",
					content: "Content",
					excerpt: "",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const result = await getAllPosts(adapter, { slug: "post-a" });
			expect(result.items).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(result.items[0]!.slug).toBe("post-a");
		});

		it("searches posts by query string", async () => {
			await adapter.create({
				model: "post",
				data: {
					title: "TypeScript Tips",
					slug: "ts-tips",
					content: "Using generics",
					excerpt: "",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "post",
				data: {
					title: "React Hooks",
					slug: "react-hooks",
					content: "Using hooks",
					excerpt: "",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const result = await getAllPosts(adapter, { query: "typescript" });
			expect(result.items).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(result.items[0]!.slug).toBe("ts-tips");
		});

		it("respects limit and offset", async () => {
			for (let i = 1; i <= 5; i++) {
				await adapter.create({
					model: "post",
					data: {
						title: `Post ${i}`,
						slug: `post-${i}`,
						content: "Content",
						excerpt: "",
						published: true,
						tags: [],
						createdAt: new Date(Date.now() + i * 1000),
						updatedAt: new Date(),
					},
				});
			}

			const page1 = await getAllPosts(adapter, { limit: 2, offset: 0 });
			expect(page1.items).toHaveLength(2);
			expect(page1.total).toBe(5);

			const page2 = await getAllPosts(adapter, { limit: 2, offset: 2 });
			expect(page2.items).toHaveLength(2);
			expect(page2.total).toBe(5);

			// Pages should be different posts
			expect(page1.items[0]!.slug).not.toBe(page2.items[0]!.slug);
		});

		it("attaches tags to posts", async () => {
			const post = await adapter.create({
				model: "post",
				data: {
					title: "Tagged Post",
					slug: "tagged",
					content: "Content",
					excerpt: "",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const tag = await adapter.create({
				model: "tag",
				data: {
					name: "JavaScript",
					slug: "javascript",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "postTag",
				data: { postId: (post as any).id, tagId: (tag as any).id },
			});

			const result = await getAllPosts(adapter);
			expect(result.items[0]!.tags).toHaveLength(1);
			expect(result.items[0]!.tags[0]!.slug).toBe("javascript");
		});

		it("filters posts by tagSlug and returns empty for missing tag", async () => {
			const result = await getAllPosts(adapter, { tagSlug: "nonexistent" });
			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("filters posts by tagSlug - returns only tagged posts", async () => {
			const taggedPost = await adapter.create({
				model: "post",
				data: {
					title: "Tagged Post",
					slug: "tagged-post",
					content: "Content",
					excerpt: "",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			for (let i = 1; i <= 3; i++) {
				await adapter.create({
					model: "post",
					data: {
						title: `Untagged Post ${i}`,
						slug: `untagged-${i}`,
						content: "Content",
						excerpt: "",
						published: true,
						tags: [],
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				});
			}
			const tag = await adapter.create({
				model: "tag",
				data: {
					name: "TypeScript",
					slug: "typescript",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "postTag",
				data: { postId: (taggedPost as any).id, tagId: (tag as any).id },
			});

			const result = await getAllPosts(adapter, { tagSlug: "typescript" });
			expect(result.items).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(result.items[0]!.slug).toBe("tagged-post");
		});

		it("paginates tagSlug results at the DB level - limit/offset respected", async () => {
			// Create a tag and 5 posts tagged with it, plus 10 untagged posts.
			// With DB-level filtering the findMany should only receive 5 rows,
			// never loading the 10 untagged posts into memory.
			const tag = await adapter.create({
				model: "tag",
				data: {
					name: "JS",
					slug: "js",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			for (let i = 1; i <= 5; i++) {
				const post = await adapter.create({
					model: "post",
					data: {
						title: `JS Post ${i}`,
						slug: `js-post-${i}`,
						content: "Content",
						excerpt: "",
						published: true,
						tags: [],
						createdAt: new Date(Date.now() + i * 1000),
						updatedAt: new Date(),
					},
				});
				await adapter.create({
					model: "postTag",
					data: { postId: (post as any).id, tagId: (tag as any).id },
				});
			}
			for (let i = 1; i <= 10; i++) {
				await adapter.create({
					model: "post",
					data: {
						title: `Noise Post ${i}`,
						slug: `noise-${i}`,
						content: "Content",
						excerpt: "",
						published: true,
						tags: [],
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				});
			}

			const page1 = await getAllPosts(adapter, {
				tagSlug: "js",
				limit: 2,
				offset: 0,
			});
			expect(page1.items).toHaveLength(2);
			expect(page1.total).toBe(5);
			expect(page1.items.every((p) => p.slug.startsWith("js-post"))).toBe(true);

			const page2 = await getAllPosts(adapter, {
				tagSlug: "js",
				limit: 2,
				offset: 2,
			});
			expect(page2.items).toHaveLength(2);
			expect(page2.total).toBe(5);

			const page3 = await getAllPosts(adapter, {
				tagSlug: "js",
				limit: 2,
				offset: 4,
			});
			expect(page3.items).toHaveLength(1);
			expect(page3.total).toBe(5);

			// Pages must be disjoint
			const allSlugs = [...page1.items, ...page2.items, ...page3.items].map(
				(p) => p.slug,
			);
			expect(new Set(allSlugs).size).toBe(5);
		});

		it("tagSlug combined with published filter only returns published tagged posts", async () => {
			const tag = await adapter.create({
				model: "tag",
				data: {
					name: "CSS",
					slug: "css",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const published = await adapter.create({
				model: "post",
				data: {
					title: "Published CSS Post",
					slug: "pub-css",
					content: "Content",
					excerpt: "",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const draft = await adapter.create({
				model: "post",
				data: {
					title: "Draft CSS Post",
					slug: "draft-css",
					content: "Content",
					excerpt: "",
					published: false,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "postTag",
				data: { postId: (published as any).id, tagId: (tag as any).id },
			});
			await adapter.create({
				model: "postTag",
				data: { postId: (draft as any).id, tagId: (tag as any).id },
			});

			const result = await getAllPosts(adapter, {
				tagSlug: "css",
				published: true,
			});
			expect(result.items).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(result.items[0]!.slug).toBe("pub-css");
		});

		it("returns all posts when no limit is specified (DB path - more than 10)", async () => {
			for (let i = 1; i <= 15; i++) {
				await adapter.create({
					model: "post",
					data: {
						title: `Post ${i}`,
						slug: `post-${i}`,
						content: "Content",
						excerpt: "",
						published: true,
						tags: [],
						createdAt: new Date(Date.now() + i * 1000),
						updatedAt: new Date(),
					},
				});
			}

			const result = await getAllPosts(adapter);
			expect(result.items).toHaveLength(15);
			expect(result.total).toBe(15);
			expect(result.limit).toBeUndefined();
		});

		it("returns all matching posts when no limit is specified (in-memory query path - more than 10)", async () => {
			for (let i = 1; i <= 15; i++) {
				await adapter.create({
					model: "post",
					data: {
						title: `TypeScript Post ${i}`,
						slug: `ts-post-${i}`,
						content: "TypeScript content",
						excerpt: "",
						published: true,
						tags: [],
						createdAt: new Date(Date.now() + i * 1000),
						updatedAt: new Date(),
					},
				});
			}

			const result = await getAllPosts(adapter, { query: "TypeScript" });
			expect(result.items).toHaveLength(15);
			expect(result.total).toBe(15);
			expect(result.limit).toBeUndefined();
		});

		it("total reflects count before pagination slice for in-memory filters", async () => {
			for (let i = 1; i <= 4; i++) {
				await adapter.create({
					model: "post",
					data: {
						title: `TypeScript Post ${i}`,
						slug: `ts-post-${i}`,
						content: "TypeScript content",
						excerpt: "",
						published: true,
						tags: [],
						createdAt: new Date(Date.now() + i * 1000),
						updatedAt: new Date(),
					},
				});
			}

			const result = await getAllPosts(adapter, {
				query: "TypeScript",
				limit: 2,
				offset: 0,
			});
			expect(result.items).toHaveLength(2);
			expect(result.total).toBe(4);
		});
	});

	describe("getPostBySlug", () => {
		it("returns null when post does not exist", async () => {
			const post = await getPostBySlug(adapter, "nonexistent");
			expect(post).toBeNull();
		});

		it("returns the post when it exists", async () => {
			await adapter.create({
				model: "post",
				data: {
					title: "My Post",
					slug: "my-post",
					content: "Content",
					excerpt: "",
					published: true,
					tags: [],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const post = await getPostBySlug(adapter, "my-post");
			expect(post).not.toBeNull();
			expect(post!.slug).toBe("my-post");
			expect(post!.title).toBe("My Post");
		});
	});

	describe("getAllTags", () => {
		it("returns empty array when no tags exist", async () => {
			const tags = await getAllTags(adapter);
			expect(tags).toEqual([]);
		});

		it("returns all tags sorted alphabetically by name", async () => {
			await adapter.create({
				model: "tag",
				data: {
					name: "TypeScript",
					slug: "typescript",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "tag",
				data: {
					name: "React",
					slug: "react",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const tags = await getAllTags(adapter);
			expect(tags).toHaveLength(2);
			expect(tags[0]!.name).toBe("React");
			expect(tags[1]!.name).toBe("TypeScript");
		});
	});
});
