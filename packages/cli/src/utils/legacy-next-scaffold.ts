import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ConflictPolicy } from "./file-writer";
import type { FileWritePlanItem } from "../types";

interface LegacyNextFile {
	legacyPath: string;
	targetPath: string;
	markers: string[];
}

function getLegacyNextFiles(prefix: string): LegacyNextFile[] {
	return [
		{
			legacyPath: `${prefix}app/pages/[[...all]]/page.tsx`,
			targetPath: `${prefix}app/(request)/pages/[[...all]]/page.tsx`,
			markers: ["createNextPage", "getStackClientForRequest"],
		},
		{
			legacyPath: `${prefix}app/pages/layout.tsx`,
			targetPath: `${prefix}app/(request)/pages/layout.tsx`,
			markers: ["BtstPagesClientLayout", "getServerClientOrigins"],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-blog/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-blog/page.tsx`,
			markers: ["prefetchForRoute", 'normalizePath(["blog"])'],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-blog/[slug]/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-blog/[slug]/page.tsx`,
			markers: ["prefetchForRoute", 'normalizePath(["blog", slug])'],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-cms/[typeSlug]/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-cms/[typeSlug]/page.tsx`,
			markers: ["prefetchForRoute", 'normalizePath(["cms", typeSlug])'],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-forms/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-forms/page.tsx`,
			markers: ["prefetchForRoute", 'normalizePath(["forms"])'],
		},
		{
			legacyPath: `${prefix}app/pages/ssg-kanban/page.tsx`,
			targetPath: `${prefix}app/(static)/pages/ssg-kanban/page.tsx`,
			markers: ["prefetchForRoute", 'normalizePath(["kanban"])'],
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

	const customized = found.filter((file) =>
		file.markers.some((marker) => !file.content.includes(marker)),
	);
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
