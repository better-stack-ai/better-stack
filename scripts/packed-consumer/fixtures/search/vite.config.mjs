import shared from "./browser-guard.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const commonjs = process.env.SEARCH_CJS === "1";
const entries = [
	"@btst/plugin-search/client",
	"@btst/plugin-search/client/components",
	"@btst/plugin-search/query-keys",
	"@btst/stack/client",
	"@btst/stack/client/components",
	"@btst/stack/plugins/client",
	"@btst/stack/plugins/client/hooks",
	"@btst/stack/context",
	"@tanstack/react-query",
];
export default {
	resolve: {
		alias: commonjs
			? entries.map((name) => {
					const replacement = require.resolve(name);
					assert.match(replacement, /\.cjs$/);
					return { find: new RegExp(`^${name}$`), replacement };
				})
			: [],
	},
	build: {
		emptyOutDir: !commonjs,
		rollupOptions: { input: commonjs ? "commonjs.html" : "index.html" },
	},
	plugins: [
		{
			name: "verify-search-standalone-browser-graph",
			generateBundle() {
				for (const id of this.getModuleIds()) {
					assert.doesNotMatch(
						id,
						/plugin-(?:blog|cms|school|ecommerce)|@btst\/components\//,
					);
				}
			},
		},
		...shared.plugins,
	],
};
