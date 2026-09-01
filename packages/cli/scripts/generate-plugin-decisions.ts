#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PLUGIN_DECISIONS } from "../src/utils/plugin-decision";

const manifestPath = resolve(import.meta.dirname, "../plugin-decisions.json");
const biomeCli = createRequire(import.meta.url).resolve(
	"@biomejs/biome/bin/biome",
);
const output = execFileSync(
	biomeCli,
	["format", "--stdin-file-path", manifestPath],
	{
		encoding: "utf8",
		input: `${JSON.stringify(
			{ schemaVersion: 1, plugins: PLUGIN_DECISIONS },
			null,
			2,
		)}\n`,
	},
);

const shouldCheck = process.argv.includes("--check");
const shouldWrite = process.argv.includes("--write");

if (shouldCheck === shouldWrite) {
	throw new Error("Pass exactly one of --check or --write.");
}

if (shouldCheck) {
	let current: string;
	try {
		current = await readFile(manifestPath, "utf8");
	} catch {
		console.error(
			"Plugin decision manifest is missing. Run `pnpm plugin-decisions:generate`.",
		);
		process.exitCode = 1;
		current = "";
	}

	if (current && current !== output) {
		console.error(
			"Plugin decision manifest drifted. Run `pnpm plugin-decisions:generate` and review the JSON change.",
		);
		process.exitCode = 1;
	}
} else {
	await writeFile(manifestPath, output, "utf8");
}
