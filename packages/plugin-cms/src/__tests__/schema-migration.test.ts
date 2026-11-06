import { DatabaseSync } from "node:sqlite";
import { getMigrations } from "better-auth/db/migration";
import { expect, it } from "vitest";
import { cmsSchema } from "../db";

it("migrates populated CMS tables additively and leaves the next migration empty", async () => {
	const database = new DatabaseSync(":memory:");
	try {
		const { contentRevision: _revisions, ...legacySchema } = cmsSchema.schema;
		const { publishAt: _schedule, ...legacyFields } =
			legacySchema.contentItem!.fields;
		const before = await getMigrations({
			database,
			plugins: [
				{
					id: "cms",
					schema: {
						...legacySchema,
						contentItem: { ...legacySchema.contentItem!, fields: legacyFields },
					},
				},
			],
		});
		await before.runMigrations();
		database
			.prepare(
				"INSERT INTO contentType (id, name, slug, jsonSchema, createdAt, updatedAt) VALUES (?, ?, ?, ?, 0, 0)",
			)
			.run("type", "Article", "article", "{}");
		database
			.prepare(
				"INSERT INTO contentItem (id, contentTypeId, slug, data, authorId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 0, 0)",
			)
			.run(
				"legacy",
				"type",
				"legacy-slug",
				'{"title":"Legacy payload"}',
				"author",
			);
		const options = {
			database,
			plugins: [{ id: "cms", schema: cmsSchema.schema }],
		};
		const upgrade = await getMigrations(options);
		expect(upgrade.unsafeChanges).toEqual([]);
		expect(upgrade.toBeCreated.map((table) => table.table)).toEqual([
			"contentRevision",
		]);
		expect(
			upgrade.toBeAdded.map((table) => [
				table.table,
				Object.keys(table.fields),
			]),
		).toEqual([["contentItem", ["publishAt"]]]);
		await upgrade.runMigrations();
		expect(
			database
				.prepare(
					"SELECT id, contentTypeId, slug, data, authorId, publishAt FROM contentItem",
				)
				.get(),
		).toEqual({
			id: "legacy",
			contentTypeId: "type",
			slug: "legacy-slug",
			data: '{"title":"Legacy payload"}',
			authorId: "author",
			publishAt: null,
		});
		const insertRevision = database.prepare(
			"INSERT INTO contentRevision (id, contentItemId, revisionKey, version, slug, data, createdAt) VALUES (?, ?, ?, ?, ?, ?, 0)",
		);
		insertRevision.run("r1", "legacy", "legacy:1", 1, "legacy-slug", "{}");
		expect(() =>
			insertRevision.run("r2", "legacy", "legacy:1", 1, "legacy-slug", "{}"),
		).toThrow(/unique/i);
		database.exec("PRAGMA foreign_keys = ON");
		database.prepare("DELETE FROM contentItem WHERE id = ?").run("legacy");
		expect(database.prepare("SELECT * FROM contentRevision").all()).toEqual([]);
		const repeat = await getMigrations(options);
		expect(repeat.toBeAdded).toEqual([]);
		expect(repeat.toBeCreated).toEqual([]);
	} finally {
		database.close();
	}
});
