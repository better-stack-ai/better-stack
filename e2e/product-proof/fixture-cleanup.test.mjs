import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cleanupFixtures, withFixtureCleanup } from "./fixture-cleanup.mjs";
const seed = JSON.parse(
	await readFile(new URL("./dogfood-data.json", import.meta.url), "utf8"),
);

function fixtureApi({ failDelete } = {}) {
	const fixtures = {
		"/api/data/posts": seed.posts.map((item, index) => ({
			...item,
			id: `post-${index}`,
		})),
		"/api/data/comments": seed.comments.map((item, index) => ({
			...item,
			id: `comment-${index}`,
		})),
		[`/api/data/content/${seed.cms.typeSlug}`]: seed.cms.records.map(
			(item, index) => ({ ...item, id: `cms-${index}` }),
		),
		"/api/data/boards": [{ ...seed.kanban, id: "board-1" }],
		"/api/data/columns": [{ id: "column-1", boardId: "board-1" }],
		"/api/data/tasks": [{ id: "task-1", columnId: "column-1" }],
		"/api/data/content/ui-builder-page": [{ ...seed.uiBuilder, id: "page-1" }],
		"/api/data/media/assets": [
			{ originalName: seed.media.uploadName, id: "media-1" },
		],
	};
	const rows = Object.fromEntries(
		Object.keys(fixtures).map((path) => [
			path,
			[
				{
					id: "unrelated",
					slug: "unrelated",
					body: "not fixture",
					originalName: "unrelated.png",
				},
			],
		]),
	);
	const deleted = [];
	const send = async (method, path) => {
		const url = new URL(path, "https://fixture.invalid");
		if (method === "DELETE") {
			const base = url.pathname.slice(0, url.pathname.lastIndexOf("/"));
			const id = decodeURIComponent(url.pathname.split("/").at(-1));
			if (id === failDelete) throw new Error(`delete failed: ${id}`);
			rows[base] = rows[base].filter((item) => item.id !== id);
			deleted.push(id);
			return;
		}
		assert.equal(method, "GET");
		if (url.pathname === "/api/data/boards/board-1")
			return {
				columns: rows["/api/data/columns"]
					.filter((c) => c.boardId === "board-1")
					.map((c) => ({
						...c,
						tasks: rows["/api/data/tasks"].filter((t) => t.columnId === c.id),
					})),
			};
		let result = rows[url.pathname];
		assert.ok(result, `unexpected endpoint ${path}`);
		for (const key of ["resourceId", "resourceType", "status"])
			if (url.searchParams.has(key))
				result = result.filter(
					(item) => item[key] === url.searchParams.get(key),
				);
		const offset = Number(url.searchParams.get("offset") ?? 0);
		return { items: result.slice(offset, offset + 100), total: result.length };
	};
	return {
		rows,
		fixtures,
		send,
		deleted,
		seed: (limit = Infinity) => {
			for (const [path, items] of Object.entries(fixtures).slice(0, limit))
				rows[path].push(...items);
		},
	};
}

for (const fails of [false, true])
	test(`cleans all records after ${fails ? "partial setup failure" : "successful capture"} and preserves unrelated rows`, async () => {
		const api = fixtureApi();
		const run = withFixtureCleanup(api.send, seed, async () => {
			api.seed(fails ? 3 : Infinity);
			if (fails) throw new Error("capture interrupted");
			return "captured";
		});
		if (fails) await assert.rejects(run, /capture or fixture cleanup failed/);
		else assert.equal(await run, "captured");
		for (const rows of Object.values(api.rows))
			assert.deepEqual(
				rows.map((item) => item.id),
				["unrelated"],
			);
	});

test("a delete failure does not prevent cleaning independent fixtures", async () => {
	const api = fixtureApi({ failDelete: "post-0" });
	api.seed();
	await assert.rejects(cleanupFixtures(api.send, seed));
	assert.ok(api.deleted.includes("media-1"));
	assert.ok(api.deleted.includes("page-1"));
	assert.ok(api.deleted.includes("post-1"));
});

test("scans beyond the first page before deleting to avoid pagination shifts", async () => {
	const api = fixtureApi();
	api.rows["/api/data/posts"].push(
		...Array.from({ length: 100 }, (_, i) => ({
			id: `other-${i}`,
			slug: `other-${i}`,
		})),
	);
	api.seed();
	await cleanupFixtures(api.send, seed);
	assert.equal(api.rows["/api/data/posts"].length, 101);
	assert.ok(api.deleted.includes("post-2"));
});

test("failed child deletion preserves its board for retry while cleaning other plugins", async () => {
	const api = fixtureApi({ failDelete: "task-1" });
	api.seed();
	await assert.rejects(cleanupFixtures(api.send, seed));
	assert.ok(api.rows["/api/data/boards"].some((item) => item.id === "board-1"));
	assert.ok(
		api.rows["/api/data/columns"].some((item) => item.id === "column-1"),
	);
	assert.ok(api.deleted.includes("media-1"));
});
