import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { confirm, isCancel, select } from "@clack/prompts";
import type { FileWritePlanItem } from "../types";

export type ConflictPolicy = "ask" | "skip" | "overwrite";

function makeDiffPreview(previousContent: string, nextContent: string): string {
	const before = previousContent.split("\n");
	const after = nextContent.split("\n");
	const max = Math.max(before.length, after.length);
	const out: string[] = [];

	for (let index = 0; index < max; index++) {
		const prev = before[index];
		const next = after[index];
		if (prev === next) continue;
		if (prev !== undefined) out.push(`- ${prev}`);
		if (next !== undefined) out.push(`+ ${next}`);
		if (out.length > 12) break;
	}

	return out.join("\n");
}

export async function writePlannedFiles(
	cwd: string,
	files: FileWritePlanItem[],
	policy: ConflictPolicy,
): Promise<{ written: string[]; skipped: string[] }> {
	const written: string[] = [];
	const skipped: string[] = [];

	for (const file of files) {
		const absolutePath = join(cwd, file.path);
		let existingContent: string | null = null;
		try {
			existingContent = await readFile(absolutePath, "utf8");
		} catch {
			existingContent = null;
		}

		if (existingContent === file.content) {
			skipped.push(file.path);
			continue;
		}

		let shouldWrite = true;
		if (existingContent !== null) {
			if (policy === "skip") shouldWrite = false;
			if (policy === "ask") {
				const action = await select({
					message: `File exists: ${file.path}`,
					options: [
						{ label: "Overwrite", value: "overwrite" },
						{ label: "Skip", value: "skip" },
						{ label: "Show diff preview", value: "diff" },
					],
				});
				if (isCancel(action)) {
					throw new Error("Cancelled by user");
				}
				if (action === "skip") {
					shouldWrite = false;
				}
				if (action === "diff") {
					console.log(`\n${makeDiffPreview(existingContent, file.content)}\n`);
					const retry = await confirm({
						message: `Overwrite ${file.path}?`,
						initialValue: false,
					});
					if (isCancel(retry)) {
						throw new Error("Cancelled by user");
					}
					shouldWrite = Boolean(retry);
				}
			}
		}

		if (!shouldWrite) {
			skipped.push(file.path);
			continue;
		}

		await mkdir(dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, file.content, "utf8");
		written.push(file.path);
	}

	return { written, skipped };
}
