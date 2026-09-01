#!/usr/bin/env tsx
/**
 * Scan plugin sources for `t("key", "Default")` / `useTranslate()` call sites.
 *
 * Usage:
 *   pnpm exec tsx packages/stack/scripts/extract-i18n-keys.ts
 *
 * Output: JSON map of file → [{ key, defaultValue }] for #136 migration reference.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dirname, "../src/plugins");

const CALL_PATTERN =
	/\bt\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*["'`]((?:\\.|[^"'`\\])*)["'`]/g;

function walk(dir: string, files: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			walk(full, files);
		} else if (/\.(tsx?|jsx?)$/.test(entry)) {
			files.push(full);
		}
	}
	return files;
}

type KeyEntry = { key: string; defaultValue: string };

const results: Record<string, KeyEntry[]> = {};

for (const file of walk(ROOT)) {
	const content = readFileSync(file, "utf8");
	const entries: KeyEntry[] = [];

	for (const match of content.matchAll(CALL_PATTERN)) {
		entries.push({ key: match[1], defaultValue: match[2] });
	}

	if (entries.length > 0) {
		results[relative(join(import.meta.dirname, ".."), file)] = entries;
	}
}

console.log(JSON.stringify(results, null, 2));
