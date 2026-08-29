import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ConflictPolicy } from "./file-writer";
import type { FileWritePlanItem } from "../types";

interface LegacyNextFile {
	legacyPath: string;
	knownHashes: string[];
}

// Exact SHA-256 values for the checked-in v3.0.0-rc.2 and e9ff9448 fixtures.
// Content outside this allowlist is consumer-owned and must never be deleted.
function getLegacyNextFiles(prefix: string): LegacyNextFile[] {
	return [
		{
			legacyPath: `${prefix}app/pages/[[...all]]/page.tsx`,
			knownHashes: [
				"38abcd08846a16815c207c7367aabf7f79f4675c7965dd0309658ef5a4c3027f",
				"db349b60eeb54c73f8cce795823574612a7da3fdf15396517e6216c800bfe021",
			],
		},
		{
			legacyPath: `${prefix}app/pages/layout.tsx`,
			knownHashes: [
				"4706db333fcae7432b87e6dfc4b5a83a12396cd707f358a659ce90c5c3e01caa",
				"798a8e0d3f9fe76d53503f1428d23ba876e577a8165e0c9f0d7217c0fe182fd9",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-blog/page.tsx`,
			knownHashes: [
				"4ef38357ea2ed3a7541ad2b10c35b1a8574b8d0496c9be6656d96d40f9b48439",
				"0a00499fa4978b192dea04a7b19053b101bed8724389bc88707aba87323d85d1",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-blog/[slug]/page.tsx`,
			knownHashes: [
				"cac8a2fbc2f94444e39bd3690bbcf0cbc34320bf711d74c9b5a3d01a991987a2",
				"1a31a3817d8bd95857f324f7ee1dc39152cc644bc34772edcdfacb315852f630",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-cms/[typeSlug]/page.tsx`,
			knownHashes: [
				"15eedc602de124a00594b4f7794fdd702fd9c9f9fb84a127f0cf9549ea252d6f",
				"b396d4a8fd2648858ba25cb1fdf651061fd5a3fc7c27b10918fa8ef5cfc6ea96",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-forms/page.tsx`,
			knownHashes: [
				"4861ae658a70ccb056f5dc7d6c3e114c95b817c444213aa6ebf3f9acb63aa13a",
				"da127e6104f8e9c0dcf7cee82adbeafbd6c34527b82b1ff5ea113ef09735cbce",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-kanban/page.tsx`,
			knownHashes: [
				"4e0badc3dc8ed42559a498939346f7ea14c132199c9a1205320fb3195079359c",
				"49efbf31b982bad7f1b4e874eeb2454abaeeaf6cb2ab6b3ff767eba5dec8359a",
			],
		},
	];
}

/**
 * Removes recognized files from the previous Next.js BTST scaffold before the
 * request-aware and static route groups are written. Unknown or customized
 * files fail closed so init never silently deletes user code.
 */
export async function migrateLegacyNextScaffold(
	cwd: string,
	files: FileWritePlanItem[],
	policy: ConflictPolicy,
): Promise<string[]> {
	const requestLayout = files.find((file) =>
		file.path.endsWith("app/(request)/pages/layout.tsx"),
	);
	if (!requestLayout) return [];

	const prefix = requestLayout.path.slice(
		0,
		requestLayout.path.length - "app/(request)/pages/layout.tsx".length,
	);
	const found: Array<LegacyNextFile & { content: string }> = [];

	for (const legacyFile of getLegacyNextFiles(prefix)) {
		try {
			const content = await readFile(join(cwd, legacyFile.legacyPath), "utf8");
			found.push({ ...legacyFile, content });
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}

	if (found.length === 0) return [];

	const paths = found.map((file) => file.legacyPath).join(", ");
	if (policy !== "overwrite") {
		throw new Error(
			`Legacy BTST Next.js routes conflict with the current request/static route groups: ${paths}. Back them up and remove them, or rerun init with overwrite selected.`,
		);
	}

	const customized = found.filter((file) => {
		const hash = createHash("sha256").update(file.content).digest("hex");
		return !file.knownHashes.includes(hash);
	});
	if (customized.length > 0) {
		throw new Error(
			`Refusing to remove customized legacy BTST Next.js routes: ${customized.map((file) => file.legacyPath).join(", ")}. Move the customizations into app/(request)/pages or app/(static)/pages, then remove the legacy files and rerun init.`,
		);
	}

	for (const file of found) {
		await unlink(join(cwd, file.legacyPath));
	}

	return found.map((file) => file.legacyPath);
}
