import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planViteSsrConfig } from "../vite-ssr-config";

const directories: string[] = [];
async function fixture(content: string) {
	const cwd = await mkdtemp(join(tmpdir(), "btst-vite-config-"));
	directories.push(cwd);
	await writeFile(join(cwd, "vite.config.ts"), content);
	return cwd;
}
afterEach(async () => {
	await Promise.all(
		directories
			.splice(0)
			.map((cwd) => rm(cwd, { recursive: true, force: true })),
	);
});

describe("Vite SSR configuration", () => {
	it.each([
		"export default defineConfig({ plugins: [tailwindcss(), framework()] });",
		"const config = defineConfig({ plugins: [tailwindcss(), framework()] }); export default config;",
	])(
		"plans an idempotent patch without executing or writing configuration: %s",
		async (declaration) => {
			const original = `import { defineConfig } from "vite";\n${declaration}`;
			const cwd = await fixture(original);
			const result = await planViteSsrConfig(cwd);
			expect(await readFile(join(cwd, "vite.config.ts"), "utf8")).toBe(
				original,
			);
			expect(result.file?.content).toContain(
				"plugins: [tailwindcss(), framework()]",
			);
			expect(result.file?.content).toContain('noExternal: ["lucide-react"]');
			expect(result.warning).toBeUndefined();
			if (!result.file) throw new Error("Expected a planned config patch");
			await writeFile(join(cwd, result.file.path), result.file.content);
			expect(await planViteSsrConfig(cwd)).toEqual({});
		},
	);

	it("preserves existing SSR settings, regular expressions and package entries", async () => {
		const cwd = await fixture(`export default { plugins: [custom()], ssr: {
  external: ["native-addon"], noExternal: ["existing", /^virtual:/], target: "node"
} };`);
		const result = await planViteSsrConfig(cwd);
		expect(result.file?.content).toContain('external: ["native-addon"]');
		expect(result.file?.content).toContain(
			'noExternal: ["existing", /^virtual:/, "lucide-react"]',
		);
		expect(result.file?.content).toContain('target: "node"');
	});

	it("preserves noExternal true", async () => {
		const cwd = await fixture("export default { ssr: { noExternal: true } };");
		expect(await planViteSsrConfig(cwd)).toEqual({});
	});

	it.each([
		"export default defineConfig(() => ({ plugins: [] }));",
		"export default { ...base, plugins: [] };",
		"export default { ssr: { ...baseSsr } };",
		"export default { ssr: { noExternal: choosePackages() } };",
		"export default { ssr: { noExternal: [ } };",
	])(
		"leaves unsupported configuration unchanged with an explicit manual recipe: %s",
		async (original) => {
			const cwd = await fixture(
				`import { defineConfig } from "vite";\n${original}`,
			);
			const before = await readFile(join(cwd, "vite.config.ts"), "utf8");
			const result = await planViteSsrConfig(cwd);
			expect(result.file).toBeUndefined();
			expect(result.warning).toContain('ssr: { noExternal: ["lucide-react"] }');
			expect(await readFile(join(cwd, "vite.config.ts"), "utf8")).toBe(before);
		},
	);
});
