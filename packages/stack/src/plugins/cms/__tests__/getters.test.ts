import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { DBAdapter as Adapter } from "@btst/db";
import { cmsSchema } from "../db";
import {
	getAllContentTypes,
	getAllContentItems,
	getContentItemBySlug,
} from "../api/getters";

const createTestAdapter = (): Adapter => {
	const db = defineDb({}).use(cmsSchema);
	return createMemoryAdapter(db)({});
};

const SIMPLE_SCHEMA = JSON.stringify({
	type: "object",
	properties: {
		title: { type: "string" },
	},
	autoFormVersion: 2,
});

describe("cms getters", () => {
	let adapter: Adapter;

	beforeEach(() => {
		adapter = createTestAdapter();
	});

	describe("getAllContentTypes", () => {
		it("returns empty array when no content types exist", async () => {
			const types = await getAllContentTypes(adapter);
			expect(types).toEqual([]);
		});

		it("returns serialized content types sorted by name", async () => {
			await adapter.create({
				model: "contentType",
				data: {
					name: "Post",
					slug: "post",
					jsonSchema: SIMPLE_SCHEMA,
					autoFormVersion: 2,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "contentType",
				data: {
					name: "Article",
					slug: "article",
					jsonSchema: SIMPLE_SCHEMA,
					autoFormVersion: 2,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const types = await getAllContentTypes(adapter);
			expect(types).toHaveLength(2);
			// Sorted by name
			expect(types[0]!.slug).toBe("article");
			expect(types[1]!.slug).toBe("post");
			// Dates are serialized as strings
			expect(typeof types[0]!.createdAt).toBe("string");
		});
	});

	describe("getAllContentItems", () => {
		it("returns empty result when content type does not exist", async () => {
			const result = await getAllContentItems(adapter, "nonexistent");
			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("returns items for a content type", async () => {
			const ct = (await adapter.create({
				model: "contentType",
				data: {
					name: "Post",
					slug: "post",
					jsonSchema: SIMPLE_SCHEMA,
					autoFormVersion: 2,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			})) as any;

			await adapter.create({
				model: "contentItem",
				data: {
					contentTypeId: ct.id,
					slug: "my-post",
					data: JSON.stringify({ title: "My Post" }),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const result = await getAllContentItems(adapter, "post");
			expect(result.items).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(result.items[0]!.slug).toBe("my-post");
			expect(result.items[0]!.parsedData).toEqual({ title: "My Post" });
		});

		it("filters items by slug", async () => {
			const ct = (await adapter.create({
				model: "contentType",
				data: {
					name: "Post",
					slug: "post",
					jsonSchema: SIMPLE_SCHEMA,
					autoFormVersion: 2,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			})) as any;

			await adapter.create({
				model: "contentItem",
				data: {
					contentTypeId: ct.id,
					slug: "first",
					data: JSON.stringify({ title: "First" }),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			await adapter.create({
				model: "contentItem",
				data: {
					contentTypeId: ct.id,
					slug: "second",
					data: JSON.stringify({ title: "Second" }),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const result = await getAllContentItems(adapter, "post", {
				slug: "first",
			});
			expect(result.items).toHaveLength(1);
			expect(result.items[0]!.slug).toBe("first");
		});

		describe("search", () => {
			const seedSearchItems = async () => {
				const ct = (await adapter.create({
					model: "contentType",
					data: {
						name: "Post",
						slug: "post",
						jsonSchema: SIMPLE_SCHEMA,
						autoFormVersion: 2,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				})) as any;

				const seed = [
					{ slug: "typescript-tips", data: { title: "TypeScript Tips" } },
					{ slug: "rust-basics", data: { title: "Getting Started" } },
					{
						slug: "misc",
						data: {
							title: "Other",
							tags: ["rust", "systems"],
							meta: { author: "Ferris" },
						},
					},
				];
				for (const item of seed) {
					await adapter.create({
						model: "contentItem",
						data: {
							contentTypeId: ct.id,
							slug: item.slug,
							data: JSON.stringify(item.data),
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});
				}
			};

			it("matches items by slug, case-insensitively", async () => {
				await seedSearchItems();

				const result = await getAllContentItems(adapter, "post", {
					search: "TYPESCRIPT",
				});
				expect(result.items.map((i) => i.slug)).toEqual(["typescript-tips"]);
				expect(result.total).toBe(1);
			});

			it("matches items by data values, including arrays and nested objects", async () => {
				await seedSearchItems();

				const byValue = await getAllContentItems(adapter, "post", {
					search: "getting started",
				});
				expect(byValue.items.map((i) => i.slug)).toEqual(["rust-basics"]);

				const byArray = await getAllContentItems(adapter, "post", {
					search: "systems",
				});
				expect(byArray.items.map((i) => i.slug)).toEqual(["misc"]);

				const byNested = await getAllContentItems(adapter, "post", {
					search: "ferris",
				});
				expect(byNested.items.map((i) => i.slug)).toEqual(["misc"]);
			});

			it("returns the filtered total and paginates search results", async () => {
				await seedSearchItems();

				const page1 = await getAllContentItems(adapter, "post", {
					search: "rust",
					limit: 1,
					offset: 0,
				});
				expect(page1.total).toBe(2);
				expect(page1.items).toHaveLength(1);

				const page2 = await getAllContentItems(adapter, "post", {
					search: "rust",
					limit: 1,
					offset: 1,
				});
				expect(page2.total).toBe(2);
				expect(page2.items).toHaveLength(1);
				expect(page2.items[0]!.slug).not.toBe(page1.items[0]!.slug);
			});

			it("ignores a whitespace-only search", async () => {
				await seedSearchItems();

				const result = await getAllContentItems(adapter, "post", {
					search: "   ",
				});
				expect(result.total).toBe(3);
			});
		});
	});

	describe("getContentItemBySlug", () => {
		it("returns null when content type does not exist", async () => {
			const item = await getContentItemBySlug(adapter, "nonexistent", "item");
			expect(item).toBeNull();
		});

		it("returns null when item does not exist", async () => {
			await adapter.create({
				model: "contentType",
				data: {
					name: "Post",
					slug: "post",
					jsonSchema: SIMPLE_SCHEMA,
					autoFormVersion: 2,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const item = await getContentItemBySlug(adapter, "post", "nonexistent");
			expect(item).toBeNull();
		});

		it("returns the serialized item when it exists", async () => {
			const ct = (await adapter.create({
				model: "contentType",
				data: {
					name: "Post",
					slug: "post",
					jsonSchema: SIMPLE_SCHEMA,
					autoFormVersion: 2,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			})) as any;

			await adapter.create({
				model: "contentItem",
				data: {
					contentTypeId: ct.id,
					slug: "hello",
					data: JSON.stringify({ title: "Hello" }),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});

			const item = await getContentItemBySlug(adapter, "post", "hello");
			expect(item).not.toBeNull();
			expect(item!.slug).toBe("hello");
			expect(item!.parsedData).toEqual({ title: "Hello" });
			expect(typeof item!.createdAt).toBe("string");
		});
	});
});
