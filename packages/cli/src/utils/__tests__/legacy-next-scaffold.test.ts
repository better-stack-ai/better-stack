import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateLegacyNextScaffold } from "../legacy-next-scaffold";
import type { FileWritePlanItem } from "../../types";

const fixtureRoots: string[] = [];

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
];

async function writeFixture(cwd: string, path: string, content: string) {
	await mkdir(dirname(join(cwd, path)), { recursive: true });
	await writeFile(join(cwd, path), content, "utf8");
}

describe("legacy Next.js scaffold migration", () => {
	it("removes recognized previous scaffold routes when overwriting", async () => {
		const cwd = await createFixture();
		await writeFixture(
			cwd,
			"app/pages/layout.tsx",
			"BtstPagesClientLayout getServerClientOrigins",
		);
		await writeFixture(
			cwd,
			"app/pages/[[...all]]/page.tsx",
			"createNextPage getStackClientForRequest",
		);
		await writeFixture(
			cwd,
			"app/pages/ssg-blog/page.tsx",
			'prefetchForRoute normalizePath(["blog"])',
		);

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan, "overwrite"),
		).resolves.toEqual([
			"app/pages/[[...all]]/page.tsx",
			"app/pages/layout.tsx",
			"app/pages/ssg-blog/page.tsx",
		]);
		await expect(
			readFile(join(cwd, "app/pages/layout.tsx"), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("fails before deleting when a legacy route was customized", async () => {
		const cwd = await createFixture();
		await writeFixture(
			cwd,
			"app/pages/layout.tsx",
			"BtstPagesClientLayout getServerClientOrigins",
		);
		await writeFixture(cwd, "app/pages/[[...all]]/page.tsx", "custom route");

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan, "overwrite"),
		).rejects.toThrow("Refusing to remove customized legacy");
		await expect(
			readFile(join(cwd, "app/pages/layout.tsx"), "utf8"),
		).resolves.toContain("BtstPagesClientLayout");
	});

	it("fails closed when overwrite was not selected", async () => {
		const cwd = await createFixture();
		await writeFixture(
			cwd,
			"app/pages/layout.tsx",
			"BtstPagesClientLayout getServerClientOrigins",
		);

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan, "skip"),
		).rejects.toThrow("conflict with the current request/static route groups");
	});
});
