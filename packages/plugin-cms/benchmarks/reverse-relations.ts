import { writeFileSync } from "node:fs";
import { test, expect } from "vitest";
import { getContentItemsByRelation } from "../src/api/getters";
import {
	reverseRelationFixture,
	relationPublication,
} from "../src/__tests__/fixtures/reverse-relations";

test("reports reverse-relation query, transfer and latency costs", async () => {
	const reports = [];
	for (const fanOut of [0, 100, 1000, 5000]) {
		for (const mixedTypes of [false, true]) {
			const { adapter } = reverseRelationFixture(fanOut, mixedTypes);
			let queries = 0;
			let rows = 0;
			let bytes = 0;
			const findMany = adapter.findMany.bind(adapter);
			const findOne = adapter.findOne.bind(adapter);
			adapter.findMany = async (query) => {
				const result = await findMany(query);
				queries++;
				rows += result.length;
				bytes += Buffer.byteLength(JSON.stringify(result));
				return result;
			};
			adapter.findOne = async (query) => {
				const result = await findOne(query);
				queries++;
				rows += result ? 1 : 0;
				bytes += Buffer.byteLength(JSON.stringify(result));
				return result;
			};
			for (const publicRead of [false, true]) {
				for (const offset of [0, 200]) {
					const times = [];
					let total = 0;
					for (let repeat = 0; repeat < 6; repeat++) {
						queries = rows = bytes = 0;
						const start = performance.now();
						const result = await getContentItemsByRelation(
							adapter,
							"article",
							{ field: "related", targetId: "target", limit: 20, offset },
							publicRead ? relationPublication : undefined,
						);
						if (repeat > 0) times.push(performance.now() - start);
						total = result.total;
						expect(result.items.length).toBe(
							Math.min(20, Math.max(0, total - offset)),
						);
					}
					times.sort((a, b) => a - b);
					reports.push({
						fanOut,
						mixedTypes,
						publicRead,
						offset,
						total,
						queries,
						rows,
						bytes,
						medianMs: Number(times[2]!.toFixed(3)),
					});
				}
			}
		}
	}
	console.table(reports);
	if (process.env.CMS_BENCH_OUTPUT) {
		writeFileSync(
			process.env.CMS_BENCH_OUTPUT,
			JSON.stringify(reports, null, 2),
		);
	}
});
