import { join } from "node:path";
import type { PackageManager } from "../types";
import { exists } from "./exists";

export async function detectPackageManager(
	cwd: string,
): Promise<PackageManager> {
	if (await exists(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
	if (await exists(join(cwd, "yarn.lock"))) return "yarn";
	return "npm";
}
