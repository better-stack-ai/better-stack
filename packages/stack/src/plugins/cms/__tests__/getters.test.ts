import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { Adapter } from "@btst/db";
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
