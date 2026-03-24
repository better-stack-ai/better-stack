import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectAlias } from "../detect-alias";

async function makeTempProject(name: string): Promise<string> {
	const dir = join(tmpdir(), `btst-cli-detect-alias-${name}-${Date.now()}`);
	await mkdir(dir, { recursive: true });
	return dir;
}

describe("detectAlias", () => {
	it("falls back to default alias when tsconfig contains JSONC", async () => {
		const cwd = await makeTempProject("jsonc");
		await writeFile(
			join(cwd, "tsconfig.json"),
			`{
	// JSONC comment
	"compilerOptions": {
		"paths": {
			"@/*": ["./src/*"]
		}
	}
}
`,
		);

		await expect(detectAlias(cwd)).resolves.toBe("@/");
	});

	it("continues to jsconfig when tsconfig cannot be parsed", async () => {
		const cwd = await makeTempProject("fallback-next-candidate");
		await writeFile(join(cwd, "tsconfig.json"), "{ invalid json");
		await writeFile(
			join(cwd, "jsconfig.json"),
			JSON.stringify(
				{
					compilerOptions: {
						paths: {
							"~/*": ["./src/*"],
						},
					},
				},
				null,
				2,
			),
		);

		await expect(detectAlias(cwd)).resolves.toBe("~/");
	});
});
