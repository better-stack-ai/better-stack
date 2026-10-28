import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { DBAdapter as Adapter } from "@btst/db";
import { cmsSchema } from "../db";
import {
	getAllContentTypes,
	getAllContentItems,
	getContentItemBySlug,
	getContentItemById,
	getContentItemsByRelation,
} from "../api/getters";
import type { ContentItem, ContentType } from "../types";

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

	it("supports content-only list, ID and slug reads without changing defaults or errors", async () => {
		const contentType = await adapter.create<{ id: string }>({
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
		const now = new Date("2026-01-01T00:00:00.000Z");
		const item = await adapter.create<{ id: string }>({
			model: "contentItem",
			data: {
				contentTypeId: contentType.id,
				slug: "content-only",
				data: JSON.stringify({
					title: "Article",
					author: "Visible content author",
					nested: { tags: ["one"] },
				}),
				authorId: "private-author",
				createdAt: now,
				updatedAt: now,
			},
		});
		const expected = {
			id: item.id,
			slug: "content-only",
			parsedData: {
				title: "Article",
				author: "Visible content author",
				nested: { tags: ["one"] },
			},
			createdAt: now.toISOString(),
			updatedAt: now.toISOString(),
		};
		expect(
			await getContentItemById(adapter, item.id, { view: "content" }),
		).toEqual(expected);
		expect(
			await getContentItemBySlug(adapter, "article", "content-only", {
				view: "content",
			}),
		).toEqual(expected);
		expect(
			(
				await getAllContentItems(adapter, "article", {
					view: "content",
					search: "Visible content author",
				})
			).items,
		).toEqual([expected]);
		const selection = { view: "content", fields: ["title"] } as const;
		expect(
			(await getContentItemById(adapter, item.id, selection))?.parsedData,
		).toEqual({ title: "Article" });
		expect(
			(
				await getContentItemBySlug(
					adapter,
					"article",
					"content-only",
					selection,
				)
			)?.parsedData,
		).toEqual({ title: "Article" });
		expect(
			(
				await getAllContentItems(adapter, "article", {
					...selection,
					search: "Visible content author",
				})
			).items[0]?.parsedData,
		).toEqual({ title: "Article" });
		await expect(
			getAllContentItems(adapter, "article", {
				view: "content",
				fields: ["unknown"],
				offset: 100,
			}),
		).rejects.toThrow("Unknown top-level");
		await expect(
			getContentItemById(adapter, item.id, { fields: ["title"] }),
		).rejects.toThrow("requires view");
		await expect(
			getContentItemBySlug(adapter, "article", "content-only", {
				view: "content",
				fields: [],
			}),
		).rejects.toThrow();
		expect(await getContentItemById(adapter, item.id)).toHaveProperty("data");
		expect(
			await getContentItemById(adapter, "missing", { view: "content" }),
		).toBeNull();
		expect(
			await getContentItemBySlug(adapter, "missing", "content-only", {
				view: "content",
			}),
		).toBeNull();
		await adapter.update({
			model: "contentType",
			where: [{ field: "id", value: contentType.id }],
			update: {
				jsonSchema: JSON.stringify({
					type: "object",
					properties: Object.fromEntries([
						["__proto__", { type: "object" }],
						["title", { type: "string" }],
					]),
				}),
			},
		});
		await adapter.update({
			model: "contentItem",
			where: [{ field: "id", value: item.id }],
			update: {
				data: JSON.stringify(
					Object.fromEntries([
						["__proto__", { safe: true }],
						["title", "Article"],
					]),
				),
			},
		});
		const literalPrototype = await getContentItemById(adapter, item.id, {
			view: "content",
			fields: ["__proto__"],
		});
		expect(Object.hasOwn(literalPrototype!.parsedData, "__proto__")).toBe(true);
		expect(Object.getPrototypeOf(literalPrototype!.parsedData)).toBe(
			Object.prototype,
		);
		expect(
			Object.getOwnPropertyDescriptor(literalPrototype!.parsedData, "__proto__")
				?.value,
		).toEqual({ safe: true });
		await adapter.update({
			model: "contentItem",
			where: [{ field: "id", value: item.id, operator: "eq" }],
			update: { data: "{" },
		});
		await expect(
			getContentItemById(adapter, item.id, { view: "content" }),
		).rejects.toThrow(SyntaxError);
	});

	it("reads related pages with default pagination and preserves returned corruption errors", async () => {
		const params = { field: "categoryId", targetId: "category-1" };
		expect(await getContentItemsByRelation(adapter, "missing", params)).toEqual(
			{ items: [], total: 0, limit: 20, offset: 0 },
		);
		const type = await adapter.create<ContentType>({
			model: "contentType",
			data: {
				name: "Article",
				slug: "article",
				jsonSchema: SIMPLE_SCHEMA,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		expect(await getContentItemsByRelation(adapter, "article", params)).toEqual(
			{ items: [], total: 0, limit: 20, offset: 0 },
		);
		for (const [id, date] of [
			["older", "2026-01-01"],
			["newer", "2026-01-02"],
		] as const) {
			await adapter.create<ContentItem>({
				model: "contentItem",
				forceAllowId: true,
				data: {
					id,
					contentTypeId: type.id,
					slug: id,
					data: JSON.stringify({ title: id }),
					createdAt: new Date(date),
					updatedAt: new Date(date),
				} as ContentItem,
			});
			await adapter.create({
				model: "contentRelation",
				data: {
					sourceId: id,
					targetId: params.targetId,
					fieldName: params.field,
					createdAt: new Date(),
				},
			});
		}
		expect(
			(
				await getContentItemsByRelation(adapter, "article", {
					...params,
					view: "content",
					fields: ["title"],
					limit: 1,
				})
			).items[0]?.parsedData,
		).toEqual({ title: "newer" });
		await expect(
			getContentItemsByRelation(adapter, "article", {
				...params,
				view: "content",
				fields: ["unknown"],
				offset: 100,
			}),
		).rejects.toThrow("Unknown top-level");
		const first = await getContentItemsByRelation(adapter, "article", {
			...params,
			limit: 1,
		});
		expect(first).toMatchObject({
			items: [
				{
					id: "newer",
					parsedData: { title: "newer" },
					createdAt: "2026-01-02T00:00:00.000Z",
				},
			],
			total: 2,
			limit: 1,
			offset: 0,
		});
		expect(
			await getContentItemsByRelation(adapter, "article", {
				...params,
				limit: 1,
				view: "content",
			}),
		).toEqual({
			items: [
				{
					id: "newer",
					slug: "newer",
					parsedData: { title: "newer" },
					createdAt: "2026-01-02T00:00:00.000Z",
					updatedAt: "2026-01-02T00:00:00.000Z",
				},
			],
			total: 2,
			limit: 1,
			offset: 0,
		});
		await adapter.update({
			model: "contentItem",
			where: [{ field: "id", value: "older" }],
			update: { data: "invalid json" },
		});
		expect(
			(
				await getContentItemsByRelation(adapter, "article", {
					...params,
					limit: 1,
				})
			).items[0]?.id,
		).toBe("newer");
		await expect(
			getContentItemsByRelation(adapter, "article", {
				...params,
				limit: 1,
				offset: 1,
			}),
		).rejects.toBeInstanceOf(SyntaxError);
		await expect(
			getContentItemsByRelation(adapter, "article", {
				...params,
				limit: 1,
				offset: 1,
				view: "content",
			}),
		).rejects.toBeInstanceOf(SyntaxError);
		expect(
			await getContentItemsByRelation(adapter, "article", {
				...params,
				offset: 2,
			}),
		).toMatchObject({ items: [], total: 2 });
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
