import { expect, it, vi } from "vitest";
import { getContentItemsByRelation } from "../api/getters";
import type { ContentItem } from "../types";
import {
	reverseRelationFixture,
	relationPublication,
} from "./fixtures/reverse-relations";

it("continues past more than one batch of duplicate source relations", async () => {
	const { adapter, tables } = reverseRelationFixture(300);
	const first = tables.contentRelation[0]!;
	tables.contentRelation.push(
		...Array.from({ length: 1100 }, (_, index) => ({
			...first,
			id: `extra-duplicate-${index}`,
		})),
	);
	const page = await getContentItemsByRelation(adapter, "article", {
		field: "related",
		targetId: "target",
		limit: 2,
		offset: 298,
	});
	expect(page.total).toBe(300);
	expect(page.items.map((item) => item.id)).toEqual([
		"source-000001",
		"source-000000",
	]);
});

it("pages unique visible sources across batches, types and relation fields with bounded round trips", async () => {
	const { adapter } = reverseRelationFixture(1120, true);
	const findMany = adapter.findMany.bind(adapter);
	let queries = 0;
	let scheduledBodies = 0;
	vi.spyOn(adapter, "findMany").mockImplementation(async (query) => {
		queries++;
		const rows = await findMany(query);
		if (query.model === "contentItem" && query.select?.includes("data")) {
			scheduledBodies += (rows as ContentItem[]).filter(
				(item) => item.publishAt != null,
			).length;
		}
		return rows;
	});
	for (const publicRead of [false, true]) {
		const expected = Array.from({ length: 1120 }, (_, index) => index)
			.filter((index) => index % 5 !== 0 && (!publicRead || index % 4 === 0))
			.reverse()
			.map((index) => `source-${String(index).padStart(6, "0")}`);
		expect(expected.length).toBe(publicRead ? 224 : 896);
		const seen: string[] = [];
		for (let offset = 0; offset < expected.length + 100; offset += 100) {
			queries = 0;
			const page = await getContentItemsByRelation(
				adapter,
				"article",
				{
					field: "related",
					targetId: "target",
					limit: 100,
					offset,
					view: "content",
					fields: ["title"],
				},
				publicRead ? relationPublication : undefined,
			);
			expect(page).toMatchObject({
				total: expected.length,
				limit: 100,
				offset,
			});
			expect(page.items.map((item) => item.id)).toEqual(
				expected.slice(offset, offset + 100),
			);
			seen.push(...page.items.map((item) => item.id));
			// Three junction batches, three ID batches, at most one full-content batch.
			expect(queries).toBeLessThanOrEqual(7);
		}
		expect(seen).toEqual(expected);
	}
	expect(scheduledBodies).toBe(0);
	expect(
		await getContentItemsByRelation(adapter, "article", {
			field: "missing",
			targetId: "target",
		}),
	).toEqual({ items: [], total: 0, limit: 20, offset: 0 });
});
