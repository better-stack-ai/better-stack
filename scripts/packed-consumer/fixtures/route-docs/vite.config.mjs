import shared from "./browser-guard.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const commonjs = process.env.ROUTE_DOCS_CJS === "1";
const entries = [
	"@btst/plugin-route-docs/client",
	"@btst/stack/client",
	"@btst/stack/context",
	"@btst/stack/plugins/client",
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
			name: "verify-route-docs-browser-ownership",
			generateBundle() {
				for (const id of this.getModuleIds())
					assert.doesNotMatch(
						id,
						/(?:plugins\/(?:ai-chat|blog|media)\/|plugin-(?:ai-chat|blog|media)|@btst\/components\/)/,
					);
			},
		},
		...shared.plugins,
	],
};
