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
	["Blog", "ApiContext"].join(""),
	["Comments", "ApiContext"].join(""),
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

async function findConcatenatedHeadings(files: readonly string[]) {
	const findings: string[] = [];
	for (const file of files) {
		const content = await readFile(file, "utf8");
		for (const [index, line] of content.split("\n").entries()) {
			if (/^#{1,6}\s+.*#{1,6}\s+/.test(line)) {
				findings.push(`${relative(repositoryRoot, file)}:${index + 1}`);
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

	it("keeps contraction edits from concatenating documentation headings", async () => {
		const roots = [".agents/skills", "docs/content/docs"].map((path) =>
			resolve(repositoryRoot, path),
		);
		const files = (
			await Promise.all(roots.map((root) => collectTextFiles(root)))
		).flat();

		expect(await findConcatenatedHeadings(files)).toEqual([]);
	});

	it("keeps every generated Todo backend inside the operation boundary", async () => {
		const frameworkRoots = [
			"nextjs/lib",
			"react-router/app/lib",
			"tanstack/src/lib",
		];

		for (const frameworkRoot of frameworkRoots) {
			const pluginRoot = resolve(
				repositoryRoot,
				"scripts/codegen/files",
				frameworkRoot,
				"plugins/todo",
			);
			const backend = await readFile(
				resolve(pluginRoot, "api/backend.ts"),
				"utf8",
			);
			const permissions = await readFile(
				resolve(pluginRoot, "permissions.ts"),
				"utf8",
			);

			expect(backend).toContain("defineOperation(");
			expect(backend).toContain("operations:");
			expect(backend).toContain("operations.listTodos.route(");
			expect(backend).not.toMatch(/\n\s*api:\s*\{/);
			expect(permissions).toContain('definePermissions("todos"');
		}
	});
});
