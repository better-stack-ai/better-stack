import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getTemplateRoot(): string {
	return join(__dirname, "templates");
}

export async function renderTemplate(
	templatePath: string,
	context: Record<string, unknown>,
): Promise<string> {
	const roots = [
		getTemplateRoot(),
		join(__dirname, "..", "templates"),
		join(__dirname, "..", "src", "templates"),
		join(__dirname, "src", "templates"),
		// When bundled into dist/shared/, go up two levels to reach package root src/templates
		join(__dirname, "..", "..", "src", "templates"),
		join(__dirname, "..", "..", "templates"),
	];
	let source: string | null = null;

	for (const root of roots) {
		try {
			source = await readFile(join(root, templatePath), "utf8");
			break;
		} catch {
			// keep searching fallback roots
		}
	}

	if (!source) {
		throw new Error(`Template not found: ${templatePath}`);
	}

	const template = Handlebars.compile(source);
	return `${template(context).trimEnd()}\n`;
}
