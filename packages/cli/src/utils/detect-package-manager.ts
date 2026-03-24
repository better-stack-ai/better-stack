import { access } from "node:fs/promises";
import { join } from "node:path";
import type { PackageManager } from "../types";

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

export async function detectPackageManager(
	cwd: string,
): Promise<PackageManager> {
	if (await exists(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
	if (await exists(join(cwd, "yarn.lock"))) return "yarn";
	return "npm";
}
