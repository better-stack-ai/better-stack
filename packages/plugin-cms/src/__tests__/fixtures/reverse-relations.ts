import { memoryAdapter } from "@btst/adapter-memory";
import { cmsSchema } from "../../db";
import type { ContentType } from "../../types";

export function reverseRelationFixture(fanOut: number, mixedTypes = false) {
	const now = new Date("2026-01-01T00:00:00Z");
	const contentType: ContentType = {
		id: "article-type",
		name: "Article",
		slug: "article",
		jsonSchema: JSON.stringify({
			type: "object",
			properties: { title: { type: "string" } },
		}),
		createdAt: now,
		updatedAt: now,
	};
	const contentItem = Array.from({ length: fanOut }, (_, index) => ({
		id: `source-${String(index).padStart(6, "0")}`,
		contentTypeId:
			mixedTypes && index % 5 === 0 ? "other-type" : contentType.id,
		slug: `source-${index}`,
		data: JSON.stringify({
			title: `Source ${index}`,
			status: index % 4 === 1 ? "draft" : "published",
			body: "x".repeat(1024),
		}),
		publishAt:
			index % 4 < 2
				? null
				: new Date(index % 4 === 2 ? "2030-01-01" : "2020-01-01"),
		createdAt: now,
		updatedAt: now,
	}));
	const contentRelation = contentItem.flatMap((item, index) => {
		const relation = {
			sourceId: item.id,
			targetId: "target",
			fieldName: "related",
			createdAt: now,
		};
		return [
			{ ...relation, id: `relation-${item.id}` },
			{ ...relation, id: `field-${item.id}`, fieldName: "otherField" },
			{ ...relation, id: `target-${item.id}`, targetId: "otherTarget" },
			...(index % 10 === 0
				? [{ ...relation, id: `duplicate-${item.id}` }]
				: []),
		];
	});
	const tables = {
		contentType: [
			contentType,
			{ ...contentType, id: "other-type", slug: "other" },
		],
		contentItem,
		contentRelation,
	};
	const adapter = memoryAdapter(tables)({
		plugins: [{ id: "cms-fixture", schema: cmsSchema.schema }],
		advanced: { database: { joins: true } },
	});
	return { adapter, tables };
}

export const relationPublication = {
	stateField: "status",
	publishedValue: "published",
	scheduledValue: "scheduled",
};
