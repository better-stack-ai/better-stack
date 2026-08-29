import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { migrateLegacyNextScaffold } from "../legacy-next-scaffold";
import type { FileWritePlanItem } from "../../types";

const fixtureRoots: string[] = [];
const legacyFixtureRoot = fileURLToPath(
	new URL("../../../scripts/fixtures/legacy-next", import.meta.url),
);

async function createFixture() {
	const cwd = join(
		process.env.TMPDIR ?? "/tmp",
		`btst-legacy-next-${process.pid}-${fixtureRoots.length}`,
	);
	fixtureRoots.push(cwd);
	await mkdir(cwd, { recursive: true });
	return cwd;
}

afterEach(async () => {
	await Promise.all(
		fixtureRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true })),
	);
});

const currentPlan: FileWritePlanItem[] = [
	{
		path: "app/(request)/pages/layout.tsx",
		content: "request layout",
		description: "request layout",
	},
	{
		path: "app/(request)/pages/[[...all]]/page.tsx",
		content: "request page",
		description: "request page",
	},
	{
		path: "app/(static)/pages/ssg-blog/page.tsx",
		content: "static page",
		description: "static page",
	},
	{
		path: "app/(static)/pages/ssg-blog/[slug]/page.tsx",
		content: "static post",
		description: "static post",
	},
	{
		path: "app/(static)/pages/ssg-cms/[typeSlug]/page.tsx",
		content: "static CMS page",
		description: "static CMS page",
	},
	{
		path: "app/(static)/pages/ssg-forms/page.tsx",
		content: "static forms page",
		description: "static forms page",
	},
	{
		path: "app/(static)/pages/ssg-kanban/page.tsx",
		content: "static Kanban page",
		description: "static Kanban page",
	},
];

const legacyPaths = [
	"app/pages/[[...all]]/page.tsx",
	"app/pages/layout.tsx",
	"app/pages/ssg-blog/page.tsx",
	"app/pages/ssg-blog/[slug]/page.tsx",
	"app/pages/ssg-cms/[typeSlug]/page.tsx",
	"app/pages/ssg-forms/page.tsx",
	"app/pages/ssg-kanban/page.tsx",
];

async function writeFixture(cwd: string, path: string, content: string) {
	await mkdir(dirname(join(cwd, path)), { recursive: true });
	await writeFile(join(cwd, path), content, "utf8");
}

describe("legacy Next.js scaffold migration", () => {
	it.each(["v3.0.0-rc.2", "e9ff9448"])(
		"removes the exact %s scaffold routes when overwriting",
		async (version) => {
			const cwd = await createFixture();
			for (const path of legacyPaths) {
				await writeFixture(
					cwd,
					path,
					await readFile(join(legacyFixtureRoot, version, path), "utf8"),
				);
			}

			await expect(
				migrateLegacyNextScaffold(cwd, currentPlan, "overwrite"),
			).resolves.toEqual(legacyPaths);
			await expect(
				readFile(join(cwd, "app/pages/layout.tsx"), "utf8"),
			).rejects.toMatchObject({ code: "ENOENT" });
		},
	);

	it("fails before deleting when a legacy route retains markers but was customized", async () => {
		const cwd = await createFixture();
		const layout = await readFile(
			join(legacyFixtureRoot, "e9ff9448/app/pages/layout.tsx"),
			"utf8",
		);
		await writeFixture(
			cwd,
			"app/pages/layout.tsx",
			`${layout}\n// Keep my custom StackProvider behavior.\n`,
		);
		await writeFixture(
			cwd,
			"app/pages/[[...all]]/page.tsx",
			await readFile(
				join(legacyFixtureRoot, "e9ff9448/app/pages/[[...all]]/page.tsx"),
				"utf8",
			),
		);

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan, "overwrite"),
		).rejects.toThrow("Refusing to remove customized legacy");
		await expect(
			readFile(join(cwd, "app/pages/layout.tsx"), "utf8"),
		).resolves.toContain("Keep my custom StackProvider behavior");
	});

	it("fails closed when overwrite was not selected", async () => {
		const cwd = await createFixture();
		await writeFixture(
			cwd,
			"app/pages/layout.tsx",
			await readFile(
				join(legacyFixtureRoot, "e9ff9448/app/pages/layout.tsx"),
				"utf8",
			),
		);

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan, "skip"),
		).rejects.toThrow("conflict with the current request/static route groups");
	});
});
