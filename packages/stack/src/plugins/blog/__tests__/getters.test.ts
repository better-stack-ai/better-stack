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
		it("returns empty array when no posts exist", async () => {
			const posts = await getAllPosts(adapter);
			expect(posts).toEqual([]);
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

			const posts = await getAllPosts(adapter);
			expect(posts).toHaveLength(1);
			expect(posts[0]!.slug).toBe("hello-world");
			expect(posts[0]!.tags).toEqual([]);
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
			expect(published).toHaveLength(1);
			expect(published[0]!.slug).toBe("published");

			const drafts = await getAllPosts(adapter, { published: false });
			expect(drafts).toHaveLength(1);
			expect(drafts[0]!.slug).toBe("draft");
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
			expect(result).toHaveLength(1);
			expect(result[0]!.slug).toBe("post-a");
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
			expect(result).toHaveLength(1);
			expect(result[0]!.slug).toBe("ts-tips");
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
			expect(page1).toHaveLength(2);

			const page2 = await getAllPosts(adapter, { limit: 2, offset: 2 });
			expect(page2).toHaveLength(2);

			// Pages should be different posts
			expect(page1[0]!.slug).not.toBe(page2[0]!.slug);
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

			const posts = await getAllPosts(adapter);
			expect(posts[0]!.tags).toHaveLength(1);
			expect(posts[0]!.tags[0]!.slug).toBe("javascript");
		});

		it("filters posts by tagSlug and returns empty for missing tag", async () => {
			const result = await getAllPosts(adapter, { tagSlug: "nonexistent" });
			expect(result).toEqual([]);
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

		it("returns all tags", async () => {
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
			expect(tags.map((t) => t.slug).sort()).toEqual(["react", "typescript"]);
		});
	});
});
