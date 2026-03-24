import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectAlias } from "../detect-alias";
import { detectFramework } from "../detect-framework";
import { detectPackageManager } from "../detect-package-manager";

async function makeTempProject(name: string): Promise<string> {
	const dir = join(tmpdir(), `btst-cli-${name}-${Date.now()}`);
	await mkdir(dir, { recursive: true });
	return dir;
}

describe("detection utilities", () => {
	it("detects nextjs framework", async () => {
		const cwd = await makeTempProject("framework-next");
		await writeFile(
			join(cwd, "package.json"),
			JSON.stringify({ dependencies: { next: "15.0.0" } }),
		);
		await expect(detectFramework(cwd)).resolves.toBe("nextjs");
	});

	it("detects pnpm from lockfile", async () => {
		const cwd = await makeTempProject("package-manager");
		await writeFile(join(cwd, "pnpm-lock.yaml"), "lockfileVersion: 9");
		await expect(detectPackageManager(cwd)).resolves.toBe("pnpm");
	});

	it("detects alias from tsconfig paths", async () => {
		const cwd = await makeTempProject("alias");
		await writeFile(
			join(cwd, "tsconfig.json"),
			JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
		);
		await expect(detectAlias(cwd)).resolves.toBe("@/");
	});
});
