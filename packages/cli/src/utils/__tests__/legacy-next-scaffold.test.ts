import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { migrateLegacyNextScaffold } from "../legacy-next-scaffold";
import { LEGACY_NEXT_RENDER_HASHES } from "../legacy-next-render-hashes";
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
] as const;

// Recorded by executing buildScaffoldPlan() at each source ref with the
// fixture configuration documented in scripts/fixtures/legacy-next/README.md.
// These values are intentionally independent of the migration allowlist.
const historicalRenderedHashes = {
	"v3.0.0-rc.2": {
		"app/pages/[[...all]]/page.tsx":
			"38abcd08846a16815c207c7367aabf7f79f4675c7965dd0309658ef5a4c3027f",
		"app/pages/layout.tsx":
			"4706db333fcae7432b87e6dfc4b5a83a12396cd707f358a659ce90c5c3e01caa",
		"app/pages/ssg-blog/page.tsx":
			"4ef38357ea2ed3a7541ad2b10c35b1a8574b8d0496c9be6656d96d40f9b48439",
		"app/pages/ssg-blog/[slug]/page.tsx":
			"cac8a2fbc2f94444e39bd3690bbcf0cbc34320bf711d74c9b5a3d01a991987a2",
		"app/pages/ssg-cms/[typeSlug]/page.tsx":
			"15eedc602de124a00594b4f7794fdd702fd9c9f9fb84a127f0cf9549ea252d6f",
		"app/pages/ssg-forms/page.tsx":
			"4861ae658a70ccb056f5dc7d6c3e114c95b817c444213aa6ebf3f9acb63aa13a",
		"app/pages/ssg-kanban/page.tsx":
			"4e0badc3dc8ed42559a498939346f7ea14c132199c9a1205320fb3195079359c",
	},
	e9ff9448: {
		"variants/no-plugins-tilde-layout.tsx":
			"61aa2a94e1130be15baf740b91a9b6c51cdf9a35a781d91aa7fdcfde2b6202b6",
		"app/pages/[[...all]]/page.tsx":
			"db349b60eeb54c73f8cce795823574612a7da3fdf15396517e6216c800bfe021",
		"app/pages/layout.tsx":
			"798a8e0d3f9fe76d53503f1428d23ba876e577a8165e0c9f0d7217c0fe182fd9",
		"app/pages/ssg-blog/page.tsx":
			"0a00499fa4978b192dea04a7b19053b101bed8724389bc88707aba87323d85d1",
		"app/pages/ssg-blog/[slug]/page.tsx":
			"1a31a3817d8bd95857f324f7ee1dc39152cc644bc34772edcdfacb315852f630",
		"app/pages/ssg-cms/[typeSlug]/page.tsx":
			"b396d4a8fd2648858ba25cb1fdf651061fd5a3fc7c27b10918fa8ef5cfc6ea96",
		"app/pages/ssg-forms/page.tsx":
			"da127e6104f8e9c0dcf7cee82adbeafbd6c34527b82b1ff5ea113ef09735cbce",
		"app/pages/ssg-kanban/page.tsx":
			"49efbf31b982bad7f1b4e874eeb2454abaeeaf6cb2ab6b3ff767eba5dec8359a",
	},
} as const;

async function writeFixture(cwd: string, path: string, content: string) {
	await mkdir(dirname(join(cwd, path)), { recursive: true });
	await writeFile(join(cwd, path), content, "utf8");
}

describe("legacy Next.js scaffold migration", () => {
	it("covers the historical plugin-selection and alias matrix", () => {
		expect(LEGACY_NEXT_RENDER_HASHES["app/pages/layout.tsx"]).toHaveLength(240);
		for (const path of legacyPaths.filter(
			(path) => path !== "app/pages/layout.tsx",
		)) {
			expect(LEGACY_NEXT_RENDER_HASHES[path]).toHaveLength(12);
		}
	});

	it.each(
		Object.entries(historicalRenderedHashes).flatMap(([version, hashes]) =>
			Object.entries(hashes).map(([path, hash]) => [version, path, hash]),
		),
	)(
		"matches the historical %s renderer output for %s",
		async (version, path, hash) => {
			const content = await readFile(
				join(legacyFixtureRoot, version, path),
				"utf8",
			);
			expect(content).toBe(`${content.trimEnd()}\n`);
			expect(createHash("sha256").update(content).digest("hex")).toBe(hash);
		},
	);

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

	it("removes recognized routes for plugins deselected on rerun", async () => {
		const cwd = await createFixture();
		for (const path of legacyPaths) {
			await writeFixture(
				cwd,
				path,
				await readFile(join(legacyFixtureRoot, "e9ff9448", path), "utf8"),
			);
		}

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan.slice(0, 2), "overwrite"),
		).resolves.toEqual(legacyPaths);
		await Promise.all(
			legacyPaths.map((path) =>
				expect(readFile(join(cwd, path), "utf8")).rejects.toMatchObject({
					code: "ENOENT",
				}),
			),
		);
	});

	it("recognizes every legacy route rendered with a supported alias", async () => {
		const cwd = await createFixture();
		for (const path of legacyPaths) {
			const content = await readFile(
				join(legacyFixtureRoot, "e9ff9448", path),
				"utf8",
			);
			await writeFixture(
				cwd,
				path,
				content.replaceAll('from "@/lib/', 'from "~/lib/'),
			);
		}

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan, "overwrite"),
		).resolves.toEqual(legacyPaths);
	});

	it("recognizes an untouched legacy scaffold checked out with CRLF", async () => {
		const cwd = await createFixture();
		for (const path of legacyPaths) {
			const content = await readFile(
				join(legacyFixtureRoot, "e9ff9448", path),
				"utf8",
			);
			await writeFixture(cwd, path, content.replaceAll("\n", "\r\n"));
		}

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan, "overwrite"),
		).resolves.toEqual(legacyPaths);
	});

	it("recognizes a historical conditional layout variant", async () => {
		const cwd = await createFixture();
		await writeFixture(
			cwd,
			"app/pages/layout.tsx",
			await readFile(
				join(
					legacyFixtureRoot,
					"e9ff9448/variants/no-plugins-tilde-layout.tsx",
				),
				"utf8",
			),
		);

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan, "overwrite"),
		).resolves.toEqual(["app/pages/layout.tsx"]);
	});

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

	it("keeps the legacy layout when consumer-authored child routes remain", async () => {
		const cwd = await createFixture();
		const layout = await readFile(
			join(legacyFixtureRoot, "e9ff9448/app/pages/layout.tsx"),
			"utf8",
		);
		await writeFixture(cwd, "app/pages/layout.tsx", layout);
		await writeFixture(
			cwd,
			"app/pages/custom/page.tsx",
			"export default function CustomPage() { return null }\n",
		);

		await expect(
			migrateLegacyNextScaffold(cwd, currentPlan, "overwrite"),
		).rejects.toThrow("consumer-owned routes remain");
		await expect(
			readFile(join(cwd, "app/pages/layout.tsx"), "utf8"),
		).resolves.toBe(layout);
		await expect(
			readFile(join(cwd, "app/pages/custom/page.tsx"), "utf8"),
		).resolves.toContain("CustomPage");
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
