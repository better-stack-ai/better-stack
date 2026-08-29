import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ConflictPolicy } from "./file-writer";
import { LEGACY_NEXT_RENDER_HASHES } from "./legacy-next-render-hashes";
import type { FileWritePlanItem } from "../types";

interface LegacyNextFile {
	legacyPath: string;
	knownHashes: readonly string[];
}

const legacyNextPaths = Object.keys(LEGACY_NEXT_RENDER_HASHES) as Array<
	keyof typeof LEGACY_NEXT_RENDER_HASHES
>;

// Content outside the historical renderer matrix is consumer-owned and must
// never be deleted.
function getLegacyNextFiles(prefix: string): LegacyNextFile[] {
	return legacyNextPaths.map((path) => ({
		legacyPath: `${prefix}${path}`,
		knownHashes: LEGACY_NEXT_RENDER_HASHES[path],
	}));
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
