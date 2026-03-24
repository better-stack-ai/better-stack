import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { patchCssImports } from "../css-patcher";
import { patchLayoutWithQueryClientProvider } from "../layout-patcher";

async function makeTempProject(name: string): Promise<string> {
	const dir = join(tmpdir(), `btst-cli-${name}-${Date.now()}`);
	await mkdir(dir, { recursive: true });
	return dir;
}

describe("patchers", () => {
	it("patches css imports idempotently", async () => {
		const cwd = await makeTempProject("css-patch");
		await mkdir(join(cwd, "app"), { recursive: true });
		const cssPath = join(cwd, "app/globals.css");
		await writeFile(cssPath, '@import "tailwindcss";\n');

		await patchCssImports(cwd, "app/globals.css", [
			"test/base.css",
			"test/plugin.css",
		]);
		const first = await readFile(cssPath, "utf8");
		expect(first).toContain('@import "test/base.css";');

		await patchCssImports(cwd, "app/globals.css", [
			"test/base.css",
			"test/plugin.css",
		]);
		const second = await readFile(cssPath, "utf8");
		expect(second.match(/test\/base\.css/g)?.length).toBe(1);
	});

	it("appends imports when file contains only import lines", async () => {
		const cwd = await makeTempProject("css-import-only");
		await mkdir(join(cwd, "app"), { recursive: true });
		const cssPath = join(cwd, "app/globals.css");
		await writeFile(cssPath, '@import "tailwindcss";\n@import "foo.css";');

		await patchCssImports(cwd, "app/globals.css", ["test/plugin.css"]);
		const next = await readFile(cssPath, "utf8");

		expect(next).toBe(
			'@import "tailwindcss";\n@import "foo.css";\n@import "test/plugin.css";',
		);
	});

	it("patches layout with QueryClientProvider", async () => {
		const cwd = await makeTempProject("layout-patch");
		await mkdir(join(cwd, "app"), { recursive: true });
		const layoutPath = join(cwd, "app/layout.tsx");
		await writeFile(
			layoutPath,
			`export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html>
			<body>{children}</body>
		</html>
	)
}
`,
		);

		const result = await patchLayoutWithQueryClientProvider(
			cwd,
			"app/layout.tsx",
			"@/",
		);
		expect(result.updated).toBe(true);
		const next = await readFile(layoutPath, "utf8");
		expect(next).toContain("QueryClientProvider");
		expect(next).toContain("getOrCreateQueryClient");
	});
});
