import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AliasPrefix } from "../types";

interface ShadcnConfig {
	tailwind?: { css?: string };
	aliases?: { utils?: string; lib?: string };
}

export interface ShadcnConfigResult {
	cssFile: string | null;
	alias: AliasPrefix | null;
}

function deriveAlias(aliases: ShadcnConfig["aliases"]): AliasPrefix | null {
	const raw = aliases?.utils ?? aliases?.lib;
	if (!raw) return null;
	if (raw.startsWith("~/")) return "~/";
	if (raw.startsWith("@/")) return "@/";
	return null;
}

export async function detectShadcnConfig(
	cwd: string,
): Promise<ShadcnConfigResult | null> {
	const filePath = join(cwd, "components.json");
	let raw: string;
	try {
		raw = await readFile(filePath, "utf8");
	} catch {
		return null;
	}

	let parsed: ShadcnConfig;
	try {
		parsed = JSON.parse(raw) as ShadcnConfig;
	} catch {
		return null;
	}

	const cssFile = parsed.tailwind?.css ?? null;
	const alias = deriveAlias(parsed.aliases);

	return { cssFile, alias };
}
