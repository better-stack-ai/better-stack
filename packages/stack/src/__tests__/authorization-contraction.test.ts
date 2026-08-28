import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(process.cwd(), "../..");
const skippedDirectories = new Set([
	".git",
	".next",
	".turbo",
	"build",
	"coverage",
	"dist",
	"node_modules",
]);
const textExtensions = new Set([
	".cjs",
	".cts",
	".hbs",
	".js",
	".json",
	".jsx",
	".md",
	".mdx",
	".mjs",
	".mts",
	".ts",
	".tsx",
]);

const removedNames = [
	["Stack", "AuthProvider"].join(""),
	["Stack", "ServerAuthProvider"].join(""),
	["SchemaBound", "Stack", "AuthProvider"].join(""),
	["Can", "Params"].join(""),
	["legacy", "Authorization"].join(""),
	["legacy", "AdditionalAuthorization"].join(""),
	["legacy", "Permission"].join(""),
	["legacy", "Public"].join(""),
	["register", "IdentityResolver"].join(""),
	["get", "RequestIdentity"].join(""),
	["request", "AuthorizationConfigured"].join(""),
	["resolve", "CurrentUserId"].join(""),
	["get", "UserId"].join(""),
] as const;

async function collectTextFiles(
	directory: string,
	options: { includeBuildOutput?: boolean } = {},
): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			if (
				skippedDirectories.has(entry.name) &&
				!(options.includeBuildOutput && entry.name === "dist")
			) {
				continue;
			}
			files.push(...(await collectTextFiles(path, options)));
			continue;
		}
		if (entry.isFile() && textExtensions.has(extname(entry.name)))
			files.push(path);
	}
	return files;
}

async function findRemovedNames(files: readonly string[]) {
	const findings: string[] = [];
	for (const file of files) {
		const content = await readFile(file, "utf8");
		for (const name of removedNames) {
			if (content.includes(name)) {
				findings.push(`${relative(repositoryRoot, file)}: ${name}`);
			}
		}
	}
	return findings;
}

describe("final authorization surface contraction", () => {
	it("keeps removed RC names out of source, docs, codegen, skills, and registry artifacts", async () => {
		const roots = [".agents", "docs", "packages", "scripts"].map((path) =>
			resolve(repositoryRoot, path),
		);
		const files = (
			await Promise.all(roots.map((root) => collectTextFiles(root)))
		)
			.flat()
			.filter(
				(file) =>
					relative(repositoryRoot, file) !== "docs/content/docs/auth.mdx",
			);

		expect(await findRemovedNames(files)).toEqual([]);
	});

	it("keeps removed RC names out of emitted declarations and bundles", async () => {
		const dist = resolve(process.cwd(), "dist");
		if (!(await stat(dist).catch(() => null))) return;
		const files = await collectTextFiles(dist, { includeBuildOutput: true });

		expect(await findRemovedNames(files)).toEqual([]);
	});
});
