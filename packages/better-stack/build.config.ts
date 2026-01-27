import { defineBuildConfig } from "unbuild";
import preserveDirectives from "rollup-plugin-preserve-directives";

function withExcludedPluginPostbuildExternal(prevExternal: any) {
	const postbuildMatcher = /plugins\/[^/]+\/postbuild\.(?:js|cjs|mjs|ts)$/;
	return (id: any, importer: any, isResolved: any) => {
		const isPostbuild =
			(typeof id === "string" && postbuildMatcher.test(id)) ||
			(typeof importer === "string" && postbuildMatcher.test(importer));
		const prev =
			typeof prevExternal === "function"
				? prevExternal(id, importer, isResolved)
				: Array.isArray(prevExternal)
					? prevExternal.includes(id)
					: !!prevExternal;
		return prev || isPostbuild;
	};
}

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
	externals: [
		// peerDependencies
		"react",
		"react-dom",
		"react/jsx-runtime",
		"@tanstack/react-query",
		"sonner",
		// test/build-time deps kept external
		"vitest",
		"@vitest/runner",
		"@vitest/utils",
		"@vitest/expect",
		"@vitest/snapshot",
		"@vitest/spy",
		"chai",
		"@babel/types",
		"@babel/parser",
	],
	entries: [
		"./src/index.ts",
		"./src/api/index.ts",
		"./src/client/index.ts",
		"./src/context/index.ts",
		"./src/client/components/index.tsx",
		// plugin development entries
		"./src/plugins/api/index.ts",
		"./src/plugins/client/index.ts",
		// blog plugin entries
		"./src/plugins/blog/api/index.ts",
		"./src/plugins/blog/client/index.ts",
		"./src/plugins/blog/client/components/index.tsx",
		"./src/plugins/blog/client/hooks/index.tsx",
		"./src/plugins/blog/query-keys.ts",
		// ai-chat plugin entries
		"./src/plugins/ai-chat/api/index.ts",
		"./src/plugins/ai-chat/client/index.ts",
		"./src/plugins/ai-chat/client/components/index.ts",
		"./src/plugins/ai-chat/client/hooks/index.tsx",
		"./src/plugins/ai-chat/query-keys.ts",
		// cms plugin entries
		"./src/plugins/cms/api/index.ts",
		"./src/plugins/cms/client/index.ts",
		"./src/plugins/cms/client/components/index.tsx",
		"./src/plugins/cms/client/hooks/index.tsx",
		"./src/plugins/cms/query-keys.ts",
		// form-builder plugin entries
		"./src/plugins/form-builder/api/index.ts",
		"./src/plugins/form-builder/client/index.ts",
		"./src/plugins/form-builder/client/components/index.tsx",
		"./src/plugins/form-builder/client/hooks/index.tsx",
		"./src/plugins/form-builder/query-keys.ts",
		// open-api plugin entries
		"./src/plugins/open-api/api/index.ts",
		// route-docs plugin entries
		"./src/plugins/route-docs/client/index.ts",
		// ui-builder plugin entries
		"./src/plugins/ui-builder/index.ts",
		"./src/plugins/ui-builder/client/index.ts",
		"./src/plugins/ui-builder/client/components/index.ts",
		"./src/plugins/ui-builder/client/hooks/index.tsx",
		// kanban plugin entries
		"./src/plugins/kanban/api/index.ts",
		"./src/plugins/kanban/client/index.ts",
		"./src/plugins/kanban/client/components/index.tsx",
		"./src/plugins/kanban/client/hooks/index.tsx",
		"./src/plugins/kanban/query-keys.ts",
	],
	hooks: {
		"rollup:options"(_ctx, options) {
			// Ensure per-plugin postbuild scripts are never bundled
			options.external = withExcludedPluginPostbuildExternal(options.external);

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
						title: "better-stack bundle analysis",
						open: false,
					});
					existingPlugins.push(plugin);
				}
			}

			// Add preserve directives plugin last (must be after transform plugins)
			// Note: suppressPreserveModulesWarning is set because preserveModules IS set,
			// but the plugin checks it before outputs are finalized, causing false warnings
			existingPlugins.push(
				preserveDirectives({ suppressPreserveModulesWarning: true }),
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
