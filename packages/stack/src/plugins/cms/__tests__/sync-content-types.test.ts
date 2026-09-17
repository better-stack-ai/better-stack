import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter } from "@btst/db";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "../../../api";
import { cmsBackendPlugin } from "../api";
import type { ContentType } from "../types";

const contentTypes = [
	{
		name: "Article",
		slug: "article",
		schema: z.object({
			title: z.string(),
			status: z.enum(["draft", "published"]),
		}),
	},
];
function coldStart(adapter?: DBAdapter) {
	return createBackendStack({
		basePath: "/api",
		plugins: { cms: cmsBackendPlugin({ contentTypes }) },
		adapter: (schema) => adapter ?? createMemoryAdapter(schema)({}),
	});
}
async function fixture() {
	const stack = coldStart();
	await stack.trusted.cms.listContentTypes({});
	const stored = await stack.adapter.findOne<ContentType>({
		model: "contentType",
		where: [{ field: "slug", value: "article" }],
	});
	if (!stored) throw new Error("Missing seeded content type");
	return { adapter: stack.adapter, stored };
}

describe("CMS content-type synchronization", () => {
	it("performs no updates on repeated cold starts and preserves serialized data", async () => {
		const { adapter } = await fixture();
		const update = vi.spyOn(adapter, "update");
		const first = await coldStart(adapter).trusted.cms.listContentTypes({});
		const second = await coldStart(adapter).trusted.cms.listContentTypes({});
		expect(update).not.toHaveBeenCalled();
		expect(JSON.stringify(second)).toBe(JSON.stringify(first));
	});

	it("ignores JSON whitespace and nested object key order", async () => {
		const { adapter, stored } = await fixture();
		const reordered = JSON.stringify(
			JSON.parse(stored.jsonSchema),
			(_key, value) =>
				value && typeof value === "object" && !Array.isArray(value)
					? Object.fromEntries(Object.entries(value).reverse())
					: value,
			2,
		);
		await adapter.update({
			model: "contentType",
			where: [{ field: "id", value: stored.id }],
			update: { jsonSchema: reordered },
		});
		const update = vi.spyOn(adapter, "update");
		await coldStart(adapter).trusted.cms.listContentTypes({});
		expect(update).not.toHaveBeenCalled();
	});

	it.each([
		["name", "Old article"],
		["description", "Old description"],
		["jsonSchema", '{"type":"object","properties":{}}'],
		["jsonSchema", "invalid legacy JSON"],
		["fieldConfig", '{"title":{"fieldType":"textarea"}}'],
		["autoFormVersion", 1],
	] as const)("updates changed %s exactly once", async (field, value) => {
		const { adapter, stored } = await fixture();
		await adapter.update({
			model: "contentType",
			where: [{ field: "id", value: stored.id }],
			update: { [field]: value, updatedAt: new Date("2000-01-01") },
		});
		const update = vi.spyOn(adapter, "update");
		await coldStart(adapter).trusted.cms.listContentTypes({});
		expect(update).toHaveBeenCalledTimes(1);
		expect(update.mock.calls[0]?.[0].update).toMatchObject({
			name: "Article",
			description: null,
			jsonSchema: stored.jsonSchema,
			fieldConfig: null,
			autoFormVersion: 2,
		});
		expect(update.mock.calls[0]?.[0].update.updatedAt).not.toEqual(
			new Date("2000-01-01"),
		);
		await coldStart(adapter).trusted.cms.listContentTypes({});
		expect(update).toHaveBeenCalledTimes(1);
	});

	it("preserves meaningful array ordering in schema comparisons", async () => {
		const { adapter, stored } = await fixture();
		const schema = JSON.parse(stored.jsonSchema);
		schema.properties.status.enum.reverse();
		await adapter.update({
			model: "contentType",
			where: [{ field: "id", value: stored.id }],
			update: { jsonSchema: JSON.stringify(schema) },
		});
		const update = vi.spyOn(adapter, "update");
		await coldStart(adapter).trusted.cms.listContentTypes({});
		expect(update).toHaveBeenCalledTimes(1);
	});
});
