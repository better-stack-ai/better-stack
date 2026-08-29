import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ConflictPolicy } from "./file-writer";
import type { FileWritePlanItem } from "../types";

interface LegacyNextFile {
	legacyPath: string;
	targetPath: string;
	knownHashes: string[];
}

// Exact SHA-256 values for the checked-in v3.0.0-rc.2 and e9ff9448 fixtures.
// Content outside this allowlist is consumer-owned and must never be deleted.
function getLegacyNextFiles(prefix: string): LegacyNextFile[] {
	return [
		{
			legacyPath: `${prefix}app/pages/[[...all]]/page.tsx`,
			targetPath: `${prefix}app/(request)/pages/[[...all]]/page.tsx`,
			knownHashes: [
				"c13368465de8d139d7c2399cc915442b07de8939932de65c2a58eba92b37b7b2",
				"e2fb4e96a905e0cb3719050f70b303b6482c88903abb95ef0c53093fb953419f",
			],
		},
		{
			legacyPath: `${prefix}app/pages/layout.tsx`,
			targetPath: `${prefix}app/(request)/pages/layout.tsx`,
			knownHashes: [
				"ac2b707a3aadfe3c124aa82f2d6072696dff558c2a8eae19ca2f60865eeff401",
				"0f24f2464df6e049325ee33d3ff2bc3b6117f96ab6ead034dd919f550393c7c6",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-blog/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-blog/page.tsx`,
			knownHashes: [
				"c72d80f0c59b497ed8bcfbdd0f7456c154165a6da4e97b0f08283ec9a3dd10ed",
				"1c9c019b60774c5a30cb07309cee12bbacf9578fef3be2a91ba7b0af88eb9176",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-blog/[slug]/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-blog/[slug]/page.tsx`,
			knownHashes: [
				"c94f5d2db0efca632eb252682589d920aa6c9c7da002a95b71ec3acbeb635c5a",
				"553fb0f2cdd124cc96ea8943b5fbffbdfae02c2054321b8cb83c0134381ccbf8",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-cms/[typeSlug]/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-cms/[typeSlug]/page.tsx`,
			knownHashes: [
				"a5ecad718ae1c5cc92dfbbc07c91db78c41e768d92329fef6e2b284d759b2c5e",
				"bc57505b564eed2dca857e74e59552e5f37deb1f4ddd188f1b5d8aeb84cb2f9a",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-forms/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-forms/page.tsx`,
			knownHashes: [
				"be18c139238689c1bdc786856df8b7ef2dda8977d9d3eda26b1d6aa5e7634dc8",
				"6517af3b4c67040eede04ead0f9f4f91007225d7c8a5633fd256a1b9a304fe97",
			],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-kanban/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-kanban/page.tsx`,
			knownHashes: [
				"d056db155576aaf1519a4db2f6257e53f8aaa52e62e79195beca8761105f6fb2",
				"6164d07e1489befbe2ee4b67f46dd409b6dc7484c4f8983193875d58ac9781d4",
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
	const targetPaths = new Set(files.map((file) => file.path));
	const found: Array<LegacyNextFile & { content: string }> = [];

	for (const legacyFile of getLegacyNextFiles(prefix)) {
		if (!targetPaths.has(legacyFile.targetPath)) continue;
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
