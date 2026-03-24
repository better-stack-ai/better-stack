import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Framework } from "../types";

interface PackageJsonLike {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

export async function detectFramework(cwd: string): Promise<Framework | null> {
	const packageJsonPath = join(cwd, "package.json");
	try {
		await access(packageJsonPath);
	} catch {
		return null;
	}

	const raw = await readFile(packageJsonPath, "utf8");
	const parsed = JSON.parse(raw) as PackageJsonLike;
	const deps = {
		...(parsed.dependencies ?? {}),
		...(parsed.devDependencies ?? {}),
	};

	if ("next" in deps) return "nextjs";
	if ("react-router" in deps || "@react-router/node" in deps) {
		return "react-router";
	}
	if ("@tanstack/react-router" in deps || "@tanstack/start" in deps) {
		return "tanstack";
	}

	return null;
}
