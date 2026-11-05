import shared from "./browser-guard.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const commonjs = process.env.FEATURE_FLAGS_CJS === "1";
const entries = [
	"@btst/plugin-feature-flags/client",
	"@btst/plugin-feature-flags/client/components",
	"@btst/plugin-feature-flags/permissions",
	"@btst/plugin-feature-flags/query-keys",
	"@btst/plugin-feature-flags/client/hooks",
	"@btst/plugin-feature-flags/evaluate",
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
			name: "verify-feature-flags-selected-browser-graph",
			generateBundle() {
				for (const id of this.getModuleIds()) {
					assert.doesNotMatch(
						id,
						/(?:plugins\/(?:ai-chat|newsletter|blog)\/|plugin-(?:ai-chat|newsletter|blog)|@btst\/components\/)/,
					);
				}
			},
		},
		...shared.plugins,
	],
};
