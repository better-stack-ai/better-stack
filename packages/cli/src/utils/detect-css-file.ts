import { access } from "node:fs/promises";
import { join } from "node:path";
import type { Framework } from "../types";

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

const CSS_CANDIDATES: Record<Framework, string[]> = {
	nextjs: ["app/globals.css", "src/app/globals.css"],
	"react-router": ["app/app.css", "src/app.css"],
	tanstack: ["src/styles/globals.css", "src/app.css"],
};

export async function detectCssFile(
	cwd: string,
	framework: Framework,
): Promise<string | null> {
	for (const candidate of CSS_CANDIDATES[framework]) {
		if (await exists(join(cwd, candidate))) {
			return candidate;
		}
	}
	return null;
}
