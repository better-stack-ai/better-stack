import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectShadcnConfig } from "../detect-shadcn-config";

async function makeTempProject(name: string): Promise<string> {
	const dir = join(
		tmpdir(),
		`btst-cli-detect-shadcn-config-${name}-${Date.now()}`,
	);
	await mkdir(dir, { recursive: true });
	return dir;
}

describe("detectShadcnConfig", () => {
	it("returns null when components.json is absent", async () => {
		const cwd = await makeTempProject("absent");
		await expect(detectShadcnConfig(cwd)).resolves.toBeNull();
	});

	it("returns null when components.json contains invalid JSON", async () => {
		const cwd = await makeTempProject("invalid-json");
		await writeFile(join(cwd, "components.json"), "{ not valid json");
		await expect(detectShadcnConfig(cwd)).resolves.toBeNull();
	});

	it("returns cssFile and @/ alias from a full Next.js components.json", async () => {
		const cwd = await makeTempProject("nextjs");
		await writeFile(
			join(cwd, "components.json"),
			JSON.stringify({
				tailwind: { css: "app/globals.css" },
				aliases: { utils: "@/lib/utils", lib: "@/lib" },
			}),
		);
		const result = await detectShadcnConfig(cwd);
		expect(result).toEqual({ cssFile: "app/globals.css", alias: "@/" });
	});

	it("derives ~/ alias from aliases.utils", async () => {
		const cwd = await makeTempProject("tilde-utils");
		await writeFile(
			join(cwd, "components.json"),
			JSON.stringify({
				tailwind: { css: "app/app.css" },
				aliases: { utils: "~/lib/utils" },
			}),
		);
		const result = await detectShadcnConfig(cwd);
		expect(result).toEqual({ cssFile: "app/app.css", alias: "~/" });
	});

	it("derives alias from aliases.lib when aliases.utils is absent", async () => {
		const cwd = await makeTempProject("lib-fallback");
		await writeFile(
			join(cwd, "components.json"),
			JSON.stringify({
				tailwind: { css: "src/styles/globals.css" },
				aliases: { lib: "@/lib" },
			}),
		);
		const result = await detectShadcnConfig(cwd);
		expect(result).toEqual({ cssFile: "src/styles/globals.css", alias: "@/" });
	});

	it("returns null cssFile and null alias when fields are missing", async () => {
		const cwd = await makeTempProject("empty-fields");
		await writeFile(join(cwd, "components.json"), JSON.stringify({}));
		const result = await detectShadcnConfig(cwd);
		expect(result).toEqual({ cssFile: null, alias: null });
	});
});
