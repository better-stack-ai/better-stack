import { join } from "node:path";
import type { Framework } from "../types";
import { exists } from "./exists";

const FRAMEWORK_REQUIRED_PATHS: Record<Framework, string[]> = {
	nextjs: [],
	"react-router": ["app"],
	tanstack: ["src/routes"],
};

export async function detectProjectShape(
	cwd: string,
	framework: Framework,
): Promise<{ ok: true } | { ok: false; missingPaths: string[] }> {
	if (framework === "nextjs") {
		const hasAppDir =
			(await exists(join(cwd, "app"))) || (await exists(join(cwd, "src/app")));
		if (!hasAppDir) {
			return { ok: false, missingPaths: ["app or src/app"] };
		}
		return { ok: true };
	}

	const missingPaths: string[] = [];
	for (const requiredPath of FRAMEWORK_REQUIRED_PATHS[framework]) {
		if (!(await exists(join(cwd, requiredPath)))) {
			missingPaths.push(requiredPath);
		}
	}

	if (missingPaths.length > 0) {
		return { ok: false, missingPaths };
	}
	return { ok: true };
}
