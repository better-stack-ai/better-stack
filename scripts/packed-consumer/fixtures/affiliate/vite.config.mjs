import { isBuiltin, createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const commonjs = process.env.AFFILIATE_CJS === "1";
const entries = [
	"@btst/plugin-affiliate/client",
	"@btst/plugin-affiliate/client/components",
	"@btst/plugin-affiliate/permissions",
	"@btst/plugin-affiliate/query-keys",
	"@btst/stack/client",
	"@btst/stack/context",
	"@btst/stack/authorization",
	"@btst/stack/authorization/client",
	"@tanstack/react-query",
];
const alias = commonjs
	? entries.map((name) => {
			const replacement = require.resolve(name);
			assert.match(replacement, /\.cjs$/);
			return { find: new RegExp(`^${name}$`), replacement };
		})
	: [];

export default {
	resolve: { alias },
	build: {
		emptyOutDir: !commonjs,
		rollupOptions: { input: commonjs ? "commonjs.html" : "index.html" },
	},
	plugins: [
		{
			name: "verify-affiliate-selected-browser-graph",
			generateBundle() {
				for (const id of this.getModuleIds()) {
					assert.doesNotMatch(
						id,
						/(?:plugins\/(?:ai-chat|newsletter|blog)\/|plugin-(?:ai-chat|newsletter|blog)|@btst\/components\/)/,
					);
				}
			},
		},
		{
			name: "reject-browser-node-builtins",
			enforce: "pre",
			async resolveId(id, importer) {
				if (!isBuiltin(id)) return;
				const resolved = await this.resolve(id, importer, { skipSelf: true });
				if (
					!resolved ||
					resolved.external ||
					isBuiltin(resolved.id) ||
					resolved.id.includes("__vite-browser-external")
				) {
					throw new Error(`Node built-in reached the browser consumer: ${id}`);
				}
				return resolved;
			},
		},
	],
};
