import { join } from "node:path";
import type { Framework } from "../types";
import { exists } from "./exists";

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
