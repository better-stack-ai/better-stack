import assert from "node:assert/strict";
import { createRequire } from "node:module";
import shared from "./browser-guard.mjs";

const require = createRequire(import.meta.url);
const commonjs = process.env.CORE_CJS === "1";
const entries = [
	"@btst/stack/client",
	"@btst/stack/context",
	"@btst/stack/page-context",
	"@btst/stack/plugins/client",
	"@btst/stack/plugins/client/hooks",
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
		...shared.plugins,
		{
			name: "verify-core-only-browser-ownership",
			generateBundle() {
				for (const id of this.getModuleIds()) {
					assert.doesNotMatch(
						id,
						/(?:plugin-[a-z-]+\/|@btst\/components\/|@milkdown\/|react-hook-form\/)/,
					);
				}
			},
		},
	],
};
