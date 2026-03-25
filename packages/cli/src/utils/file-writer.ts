import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { confirm, isCancel, select } from "@clack/prompts";
import { diffLines } from "diff";
import type { FileWritePlanItem } from "../types";

export type ConflictPolicy = "ask" | "skip" | "overwrite";

const PREVIEW_LINE_LIMIT = 12;

function makeDiffPreview(previousContent: string, nextContent: string): string {
	const hunks = diffLines(previousContent, nextContent);
	const out: string[] = [];

	for (const hunk of hunks) {
		if (!hunk.added && !hunk.removed) continue;
		const lines = hunk.value.replace(/\n$/, "").split("\n");
		const prefix = hunk.added ? "+" : "-";
		for (const line of lines) {
			out.push(`${prefix} ${line}`);
			if (out.length >= PREVIEW_LINE_LIMIT) {
				out.push("... (diff truncated)");
				return out.join("\n");
			}
		}
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
