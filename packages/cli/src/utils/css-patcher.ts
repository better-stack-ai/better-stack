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
	if (importsToEnsure.length === 0) {
		return { updated: false, added: [] };
	}

	const fullPath = join(cwd, cssFile);
	let content: string;
	try {
		content = await readFile(fullPath, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { updated: false, added: [] };
		}
		throw error;
	}
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
	const lines = content.split("\n");
	const hasNonImportContent = lines.some(
		(line) =>
			line.trim().length > 0 && !line.trimStart().startsWith("@import "),
	);
	const lastImportIndex = lines.reduce((index, line, lineIndex) => {
		if (line.trimStart().startsWith("@import ")) {
			return lineIndex;
		}
		return index;
	}, -1);

	if (lastImportIndex === -1) {
		content = content.length > 0 ? `${importBlock}\n${content}` : importBlock;
	} else if (!hasNonImportContent) {
		content = `${content.replace(/\n+$/, "")}\n${importBlock}`;
	} else {
		lines.splice(lastImportIndex + 1, 0, importBlock);
		content = lines.join("\n");
	}

	await writeFile(fullPath, content, "utf8");
	return { updated: true, added };
}
