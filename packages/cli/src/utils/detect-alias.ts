import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AliasPrefix } from "../types";

interface TsConfigLike {
	compilerOptions?: {
		paths?: Record<string, string[]>;
	};
}

export async function detectAlias(cwd: string): Promise<AliasPrefix> {
	for (const fileName of ["tsconfig.json", "jsconfig.json"]) {
		const filePath = join(cwd, fileName);
		try {
			await access(filePath);
		} catch {
			continue;
		}

		const parsed = JSON.parse(await readFile(filePath, "utf8")) as TsConfigLike;
		const paths = parsed.compilerOptions?.paths ?? {};
		if ("@/*" in paths) return "@/";
		if ("~/*" in paths) return "~/";
	}

	return "@/";
}
