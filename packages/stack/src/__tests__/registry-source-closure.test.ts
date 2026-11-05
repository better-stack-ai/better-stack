import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("delivers the relative source dependencies of ejected UI Builder views", async () => {
	const registry: {
		files: { target: string; content: string }[];
	} = JSON.parse(
		await readFile(
			resolve(import.meta.dirname, "../../registry/btst-ui-builder.json"),
			"utf8",
		),
	);
	const consumer = await mkdtemp(join(tmpdir(), "btst-ejected-ui-builder-"));
	try {
		await Promise.all(
			registry.files.map(async (file) => {
				const target = join(consumer, file.target);
				await mkdir(dirname(target), { recursive: true });
				await writeFile(target, file.content);
			}),
		);
		for (const file of registry.files) {
			if (!/\.tsx?$/.test(file.target)) continue;
			for (const { fileName } of ts.preProcessFile(file.content, true, true)
				.importedFiles) {
				if (!fileName.startsWith(".")) continue;
				expect(
					ts.resolveModuleName(
						fileName,
						join(consumer, file.target),
						{ moduleResolution: ts.ModuleResolutionKind.Bundler },
						ts.sys,
					).resolvedModule,
					`${file.target} must receive ${fileName}`,
				).toBeDefined();
			}
		}
	} finally {
		await rm(consumer, { recursive: true, force: true });
	}
});
