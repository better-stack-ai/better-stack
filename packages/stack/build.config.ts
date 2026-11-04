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
		// optional peerDependencies (media plugin)
		"@vercel/blob",
		"@vercel/blob/client",
		"@aws-sdk/client-s3",
		"@aws-sdk/s3-request-presigner",
		// optional peerDependencies (framework router presets)
		"next",
		"next/link",
		"next/image",
		"next/navigation",
		"next/headers",
		"react-router",
		"@tanstack/react-router",
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
		// blog plugin entries
		"./src/plugins/blog/api/index.ts",
		"./src/plugins/blog/client/index.ts",
		"./src/plugins/blog/client/components/index.tsx",
		"./src/plugins/blog/client/pages/posts.tsx",
		"./src/plugins/blog/client/pages/post.tsx",
		"./src/plugins/blog/client/pages/tag.tsx",
		"./src/plugins/blog/client/hooks/index.tsx",
		"./src/plugins/blog/query-keys.ts",
		"./src/plugins/blog/permissions.ts",
		// ai-chat plugin entries
		"./src/plugins/ai-chat/api/index.ts",
		"./src/plugins/ai-chat/client/index.ts",
		"./src/plugins/ai-chat/client/components/index.ts",
		"./src/plugins/ai-chat/client/hooks/index.tsx",
		"./src/plugins/ai-chat/client/context/page-ai-context.tsx",
		"./src/plugins/ai-chat/query-keys.ts",
		"./src/plugins/ai-chat/permissions.ts",
		// cms plugin entries
		"./src/plugins/cms/api/index.ts",
		"./src/plugins/cms/client/index.ts",
		"./src/plugins/cms/client/components/index.tsx",
		"./src/plugins/cms/client/hooks/index.tsx",
		"./src/plugins/cms/query-keys.ts",
		"./src/plugins/cms/permissions.ts",
		// form-builder plugin entries
		"./src/plugins/form-builder/api/index.ts",
		"./src/plugins/form-builder/client/index.ts",
		"./src/plugins/form-builder/client/components/index.tsx",
		"./src/plugins/form-builder/client/hooks/index.tsx",
		"./src/plugins/form-builder/query-keys.ts",
		"./src/plugins/form-builder/permissions.ts",
		// open-api plugin entries
		"./src/plugins/open-api/api/index.ts",
		// route-docs plugin entries
		"./src/plugins/route-docs/client/index.ts",
		// ui-builder plugin entries
		"./src/plugins/ui-builder/index.ts",
		"./src/plugins/ui-builder/client/index.ts",
		"./src/plugins/ui-builder/client/components/index.ts",
		"./src/plugins/ui-builder/client/hooks/index.tsx",
		"./src/plugins/ui-builder/query-keys.ts",
		// job board plugin entries
		"./src/plugins/job-board/index.ts",
		"./src/plugins/job-board/api/index.ts",
		"./src/plugins/job-board/client/index.ts",
		"./src/plugins/job-board/client/components/index.tsx",
		"./src/plugins/job-board/client/hooks/index.tsx",
		"./src/plugins/job-board/query-keys.ts",
		"./src/plugins/job-board/permissions.ts",
		// kanban plugin entries
		"./src/plugins/kanban/api/index.ts",
		"./src/plugins/kanban/client/index.ts",
		"./src/plugins/kanban/client/components/index.tsx",
		"./src/plugins/kanban/client/hooks/index.tsx",
		"./src/plugins/kanban/query-keys.ts",
		"./src/plugins/kanban/permissions.ts",
		// crm plugin entries
		"./src/plugins/crm/api/index.ts",
		"./src/plugins/crm/client/index.ts",
		"./src/plugins/crm/client/components/index.tsx",
		"./src/plugins/crm/client/hooks/index.tsx",
		"./src/plugins/crm/query-keys.ts",
		"./src/plugins/crm/permissions.ts",
		// newsletter plugin entries
		"./src/plugins/newsletter/api/index.ts",
		"./src/plugins/newsletter/client/index.ts",
		"./src/plugins/newsletter/client/components/index.tsx",
		"./src/plugins/newsletter/client/hooks/index.tsx",
		"./src/plugins/newsletter/query-keys.ts",
		"./src/plugins/newsletter/permissions.ts",
		// school plugin entries
		"./src/plugins/school/api/index.ts",
		"./src/plugins/school/client/index.ts",
		"./src/plugins/school/client/components/index.tsx",
		"./src/plugins/school/client/hooks/index.tsx",
		"./src/plugins/school/query-keys.ts",
		"./src/plugins/school/permissions.ts",
		// analytics plugin entries
		"./src/plugins/analytics/api/index.ts",
		"./src/plugins/analytics/client/index.ts",
		"./src/plugins/analytics/client/components/index.tsx",
		"./src/plugins/analytics/client/hooks/index.tsx",
		"./src/plugins/analytics/query-keys.ts",
		"./src/plugins/analytics/permissions.ts",
		// feature flags plugin entries
		"./src/plugins/ecommerce/api/index.ts",
		"./src/plugins/ecommerce/client/index.ts",
		"./src/plugins/ecommerce/client/hooks/index.tsx",
		"./src/plugins/ecommerce/client/components/index.tsx",
		"./src/plugins/ecommerce/query-keys.ts",
		"./src/plugins/ecommerce/permissions.ts",
		"./src/plugins/feature-flags/api/index.ts",
		"./src/plugins/feature-flags/client/index.ts",
		"./src/plugins/feature-flags/client/components/index.tsx",
		"./src/plugins/feature-flags/client/hooks/index.tsx",
		"./src/plugins/feature-flags/query-keys.ts",
		"./src/plugins/feature-flags/permissions.ts",
		"./src/plugins/feature-flags/evaluate.ts",
		// affiliate plugin entries
		"./src/plugins/affiliate/api/index.ts",
		"./src/plugins/affiliate/client/index.ts",
		"./src/plugins/affiliate/client/components/index.tsx",
		"./src/plugins/affiliate/client/hooks/index.tsx",
		"./src/plugins/affiliate/query-keys.ts",
		"./src/plugins/affiliate/permissions.ts",
		"./src/plugins/affiliate/attribution.ts",
		// calendar plugin entries
		"./src/plugins/calendar/api/index.ts",
		"./src/plugins/calendar/client/index.ts",
		"./src/plugins/calendar/client/components/index.tsx",
		"./src/plugins/calendar/client/hooks/index.tsx",
		"./src/plugins/calendar/query-keys.ts",
		"./src/plugins/calendar/permissions.ts",
		// comments plugin entries
		"./src/plugins/comments/api/index.ts",
		"./src/plugins/comments/client/index.ts",
		"./src/plugins/comments/client/components/index.tsx",
		"./src/plugins/comments/client/hooks/index.tsx",
		"./src/plugins/comments/query-keys.ts",
		"./src/plugins/comments/permissions.ts",
		// media plugin entries
		"./src/plugins/media/api/index.ts",
		"./src/plugins/media/api/adapters/local.ts",
		"./src/plugins/media/api/adapters/s3.ts",
		"./src/plugins/media/api/adapters/vercel-blob.ts",
		"./src/plugins/media/client/index.ts",
		"./src/plugins/media/client/components/index.tsx",
		"./src/plugins/media/client/hooks/index.tsx",
		"./src/plugins/media/query-keys.ts",
		"./src/plugins/media/permissions.ts",
		"./src/components/auto-form/index.ts",
		"./src/components/stepped-auto-form/index.ts",
		"./src/components/multi-select/index.ts",
		"./src/components/search-select/index.ts",
		"./src/components/empty/index.ts",
		"./src/components/markdown/index.ts",
		"./src/components/form-builder/index.ts",
		// standalone component these require >8 GB heap to build if included;
		// "./src/components/kanban/index.ts",
		// "./src/components/ui-builder/index.ts",
		// "./src/components/minimal-tiptap/index.ts",
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
