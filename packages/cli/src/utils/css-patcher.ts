import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

function toImportLine(specifier: string): string {
	return `@import "${specifier}";`;
}

export async function patchCssImports(
	cwd: string,
	cssFile: string,
	importsToEnsure: string[],
): Promise<{ updated: boolean; added: string[] }> {
	const fullPath = join(cwd, cssFile);
	let content = await readFile(fullPath, "utf8");
	const added: string[] = [];

	for (const specifier of importsToEnsure) {
		const line = toImportLine(specifier);
		if (!content.includes(line)) {
			added.push(specifier);
		}
	}

	if (added.length === 0) {
		return { updated: false, added };
	}

	const importBlock = added
		.map((specifier) => toImportLine(specifier))
		.join("\n");
	const firstNonImportIndex = content
		.split("\n")
		.findIndex((line) => !line.trimStart().startsWith("@import "));

	if (firstNonImportIndex <= 0) {
		content = `${importBlock}\n${content}`;
	} else {
		const lines = content.split("\n");
		lines.splice(firstNonImportIndex, 0, importBlock, "");
		content = lines.join("\n");
	}

	await writeFile(fullPath, content, "utf8");
	return { updated: true, added };
}
