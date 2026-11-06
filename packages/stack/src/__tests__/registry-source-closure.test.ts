import {
	mkdtemp,
	mkdir,
	readFile,
	readdir,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("gives shared form components one registry owner and resolvable dependencies", async () => {
	const directory = resolve(import.meta.dirname, "../../registry");
	const base =
		"https://raw.githubusercontent.com/better-stack-ai/better-stack/main/packages/stack/registry/";
	const items: {
		name: string;
		dependencies?: string[];
		registryDependencies?: string[];
		files: { target: string; content: string }[];
	}[] = await Promise.all(
		(await readdir(directory))
			.filter((name) => name.startsWith("btst-") && name.endsWith(".json"))
			.map(async (name) =>
				JSON.parse(await readFile(join(directory, name), "utf8")),
			),
	);
	const byName = new Map(items.map((item) => [item.name, item]));
	const owners = new Map<string, string>();
	for (const item of items) {
		expect(
			item.registryDependencies?.some((url) =>
				url.startsWith(
					"https://raw.githubusercontent.com/better-stack-ai/form-builder/",
				),
			),
			item.name,
		).not.toBe(true);
		for (const file of item.files) {
			const owner =
				file.target.startsWith("src/components/ui/auto-form/") ||
				/^src\/lib\/(schema-converter|form-visibility)\.ts$/.test(file.target)
					? "btst-auto-form"
					: file.target.startsWith("src/components/ui/form-builder/")
						? "btst-form-builder-ui"
						: undefined;
			if (!owner) continue;
			expect(item.name, file.target).toBe(owner);
			expect(owners.has(file.target), file.target).toBe(false);
			owners.set(file.target, item.name);
		}
	}
	expect(owners.get("src/components/ui/auto-form/index.tsx")).toBe(
		"btst-auto-form",
	);
	expect(owners.get("src/components/ui/auto-form/fields/file.tsx")).toBe(
		"btst-auto-form",
	);
	expect(
		owners.get("src/components/ui/form-builder/condition-editor.tsx"),
	).toBe("btst-form-builder-ui");
	const consumer = await mkdtemp(join(tmpdir(), "btst-ejected-forms-"));
	try {
		const files = ["btst-auto-form", "btst-form-builder-ui"].flatMap(
			(name) => byName.get(name)!.files,
		);
		for (const name of ["btst-auto-form", "btst-form-builder-ui"]) {
			const item = byName.get(name)!;
			for (const file of item.files) {
				for (const { fileName } of ts.preProcessFile(file.content, true, true)
					.importedFiles) {
					if (fileName.startsWith(".") || fileName.startsWith("@/")) continue;
					const packageName = fileName
						.split("/")
						.slice(0, fileName.startsWith("@") ? 2 : 1)
						.join("/");
					expect(
						["react", "react-dom", ...(item.dependencies ?? [])],
						fileName,
					).toContain(packageName);
				}
			}
		}
		for (const file of files) {
			const target = join(consumer, file.target);
			await mkdir(dirname(target), { recursive: true });
			await writeFile(target, file.content);
		}
		for (const item of items) {
			const visit = (name: string, ancestors: string[]) => {
				expect(
					ancestors,
					`cycle: ${[...ancestors, name].join(" -> ")}`,
				).not.toContain(name);
				const dependency = byName.get(name);
				expect(dependency, `missing registry dependency ${name}`).toBeDefined();
				for (const url of dependency!.registryDependencies ?? []) {
					if (url.startsWith(base))
						visit(url.slice(base.length, -5), [...ancestors, name]);
				}
			};
			visit(item.name, []);
		}
		for (const file of files) {
			for (const { fileName } of ts.preProcessFile(file.content, true, true)
				.importedFiles) {
				if (
					!fileName.startsWith(".") &&
					!/^@\/(components\/ui\/(auto-form|form-builder)(\/|$)|lib\/(schema-converter|form-visibility)$)/.test(
						fileName,
					)
				)
					continue;
				expect(
					ts.resolveModuleName(
						fileName,
						join(consumer, file.target),
						{
							moduleResolution: ts.ModuleResolutionKind.Bundler,
							paths: { "@/*": [join(consumer, "src/*")] },
						},
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

it("keeps relative imports in the ejected Analytics sources resolvable", async () => {
	const item = JSON.parse(
		await readFile(
			resolve(import.meta.dirname, "../../registry/btst-analytics.json"),
			"utf8",
		),
	) as { files: { target: string; content: string }[] };
	const targets = new Set(item.files.map((file) => resolve(file.target)));
	for (const file of item.files) {
		for (const { fileName } of ts.preProcessFile(file.content, true, true)
			.importedFiles) {
			if (!fileName.startsWith(".")) continue;
			const path = resolve(dirname(file.target), fileName);
			expect(
				["", ".ts", ".tsx", "/index.ts", "/index.tsx"].some((suffix) =>
					targets.has(path + suffix),
				),
				`${file.target} imports ${fileName}`,
			).toBe(true);
		}
	}
});
