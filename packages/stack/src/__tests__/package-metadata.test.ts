import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("published dependency alignment", () => {
	it("uses the Better DB release that shares the Better Auth 1.6.16 cohort", async () => {
		const manifest = JSON.parse(
			await readFile(resolve("package.json"), "utf8"),
		) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};

		expect(manifest.dependencies?.["@btst/db"]).toBe("2.2.3");
		expect(manifest.devDependencies?.["@btst/adapter-memory"]).toBe("2.2.3");
		expect(manifest.devDependencies?.["@btst/yar"]).toBe("1.3.2");
		expect(manifest.peerDependencies?.["@btst/yar"]).toBe(">=1.3.2");
		expect(manifest.peerDependencies?.["better-call"]).toBe("1.3.6");
	});
});
