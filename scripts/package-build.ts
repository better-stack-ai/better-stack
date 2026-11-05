import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { defineBuildConfig } from "unbuild";
import preserveDirectives from "rollup-preserve-directives";

/** Compile private UI while leaving core and third-party resolution to consumers. */
export function packageBuild(entries: string[]) {
	const root = process.cwd();
	const source = resolve(root, "src");
	const ui = resolve(root, "../ui/src");
	const cssFiles = new Map<string, string>();
	const require = createRequire(resolve(root, "package.json"));
	const external = (id: string) =>
		!id.startsWith(".") &&
		!isAbsolute(id) &&
		!id.startsWith("\0") &&
		!id.startsWith("@workspace/ui/");

	function cssContent(
		file: string,
		seen: Set<string>,
		imports: Set<string>,
	): string {
		if (seen.has(file)) return "";
		seen.add(file);
		return readFileSync(file, "utf8").replace(
			/@import\s+["']([^"']+)["'];?/g,
			(statement, specifier: string) => {
				if (specifier.startsWith(".")) {
					return cssContent(resolve(dirname(file), specifier), seen, imports);
				}
				if (specifier.startsWith("@workspace/ui/")) {
					return cssContent(require.resolve(specifier), seen, imports);
				}
				imports.add(statement);
				return "";
			},
		);
	}

	return defineBuildConfig({
		entries,
		declaration: true,
		clean: true,
		externals: [/\.css$/],
		rollup: {
			emitCJS: true,
			output: { preserveModules: true, preserveModulesRoot: source },
			esbuild: { jsx: "automatic", jsxImportSource: "react" },
		},
		hooks: {
			"rollup:options"(_ctx, options) {
				options.external = external;
				options.plugins = [
					...(Array.isArray(options.plugins) ? options.plugins : []),
					{
						name: "private-ui-css",
						resolveId(id, importer) {
							if (!id.endsWith(".css")) return null;
							if (!id.startsWith(".") && !id.startsWith("@workspace/ui/"))
								return null;
							const file = id.startsWith(".")
								? resolve(dirname(importer!), id)
								: require.resolve(id);
							const path = file.startsWith(ui)
								? `_private/ui/${relative(ui, file)}`
								: relative(source, file);
							cssFiles.set(path, file);
							return { id: resolve(source, path), external: "absolute" };
						},
						generateBundle(_options, bundle) {
							for (const output of Object.values(bundle)) {
								if (output.type !== "chunk") continue;
								for (const path of cssFiles.keys()) {
									let specifier = relative(dirname(output.fileName), path);
									if (!specifier.startsWith(".")) specifier = `./${specifier}`;
									output.code = output.code.replaceAll(
										resolve(source, path),
										specifier,
									);
								}
							}
						},
					},
					preserveDirectives(),
				];
			},
			"rollup:dts:options"(_ctx, options) {
				options.external = external;
			},
			"rollup:done"() {
				for (const file of ["style.css", "client.css"]) {
					if (existsSync(resolve(source, file)))
						cssFiles.set(file, resolve(source, file));
				}
				for (const [path, file] of cssFiles) {
					const target = resolve(root, "dist", path);
					mkdirSync(dirname(target), { recursive: true });
					const imports = new Set<string>();
					const content = cssContent(file, new Set(), imports);
					writeFileSync(target, `${[...imports].join("\n")}\n${content}`);
				}
			},
		},
	});
}
