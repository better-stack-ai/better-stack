import { isAbsolute } from "node:path";
import { defineBuildConfig } from "unbuild";
import preserveDirectives from "rollup-plugin-preserve-directives";

const external = (id: string) =>
	!id.startsWith(".") && !isAbsolute(id) && !id.startsWith("\0");

export default defineBuildConfig({
	rollup: {
		emitCJS: true,
		output: {
			preserveModules: true,
		},
		esbuild: {
			treeShaking: true,
			jsx: "automatic",
			jsxImportSource: "react",
		},
		// Attach visualizer when ANALYZE env var is set
		dts: {
			// no-op, placeholder to keep object shape consistent across unbuild versions
		} as any,
	},
	declaration: true,
	outDir: "dist",
	clean: true,
	failOnWarn: false,
	entries: [
		"./src/index.ts",
		"./src/api/index.ts",
		"./src/payments/index.ts",
		"./src/client/index.ts",
		"./src/client/server.ts",
		"./src/client/hooks/index.ts",
		"./src/context/index.ts",
		"./src/page-context.tsx",
		"./src/authorization/index.ts",
		"./src/authorization/client.tsx",
		"./src/authorization/remote.ts",
		"./src/authorization/server.ts",
		"./src/client/components/index.tsx",
		// framework router presets
		"./src/next/index.tsx",
		"./src/next/server.ts",
		"./src/react-router/index.tsx",
		"./src/tanstack/index.tsx",
		"./src/tanstack/server.ts",
		// plugin development entries
		"./src/plugins/api/index.ts",
		"./src/plugins/client/index.ts",
		"./src/plugins/client/hooks/index.tsx",
	],
	hooks: {
		"rollup:dts:options"(_ctx, options) {
			options.external = external;
		},
		"rollup:options"(_ctx, options) {
			options.external = external;

			// Ensure preserveModules is set on outputs FIRST (must be true for preserve-directives plugin)
			// This needs to be set before plugins are added so the plugin can see it
			if (options.output) {
				if (Array.isArray(options.output)) {
					options.output.forEach((output: any) => {
						if (output) {
							output.preserveModules = true;
						}
					});
				} else if (options.output) {
					options.output.preserveModules = true;
				}
			}

			// Normalize plugins array (preserve existing plugins from unbuild)
			const existingPlugins = Array.isArray((options as any).plugins)
				? (options as any).plugins
				: [];

			// Add bundle visualizer when ANALYZE is truthy
			const analyze = process.env.ANALYZE && process.env.ANALYZE !== "0";
			if (analyze) {
				let _visualizer: any;
				try {
					// eslint-disable-next-line @typescript-eslint/no-var-requires
					_visualizer = (require as any)("rollup-plugin-visualizer").visualizer;
				} catch (_err) {
					_visualizer = null;
				}
				if (_visualizer) {
					const plugin = _visualizer({
						filename: "dist/stats.html",
						template: "treemap",
						gzipSize: true,
						brotliSize: true,
						title: "btst bundle analysis",
						open: false,
					});
					existingPlugins.push(plugin);
				}
			}

			// Add preserve directives plugin last (must be after transform plugins)
			// Note: suppressPreserveModulesWarning is set because preserveModules IS set,
			// but the plugin checks it before outputs are finalized, causing false warnings
			// Exclude .d.ts files — they contain TypeScript-only syntax that Rollup's
			// built-in parser (used by this plugin for AST inspection) cannot handle.
			existingPlugins.push(
				preserveDirectives({
					suppressPreserveModulesWarning: true,
					exclude: ["**/*.d.ts", "**/*.d.cts", "**/*.d.mts"],
				}),
			);
			(options as any).plugins = existingPlugins;

			// Ensure preserveModules is set again after plugins (in case outputs were modified)
			if (options.output) {
				if (Array.isArray(options.output)) {
					options.output.forEach((output: any) => {
						if (output) {
							output.preserveModules = true;
						}
					});
				} else if (options.output) {
					options.output.preserveModules = true;
				}
			}
		},
	},
});
