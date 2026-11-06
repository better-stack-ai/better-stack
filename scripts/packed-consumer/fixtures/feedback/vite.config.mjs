import shared from "./browser-guard.mjs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const commonjs = process.env.FEEDBACK_CJS === "1";
const entries = [
	"@btst/plugin-feedback/client",
	"@btst/plugin-feedback/client/components",
	"@btst/plugin-feedback/permissions",
	"@btst/plugin-feedback/query-keys",
	"@btst/stack/client",
	"@btst/stack/client/components",
	"@btst/stack/plugins/client",
	"@btst/stack/plugins/client/hooks",
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
			name: "verify-feedback-selected-browser-graph",
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
