import shared from "./browser-guard.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const commonjs = process.env.ANALYTICS_CJS === "1";
const alias = commonjs
	? ["client", "client/components", "permissions"].map((entry) => {
			const name = `@btst/plugin-analytics/${entry}`;
			const replacement = require.resolve(name);
			assert.match(replacement, /\.cjs$/);
			return { find: new RegExp(`^${name}$`), replacement };
		})
	: [];
export default {
	resolve: { conditions: ["module", "browser", "production", "import"], alias },
	build: {
		emptyOutDir: !commonjs,
		rollupOptions: { input: commonjs ? "commonjs.html" : "index.html" },
	},
	plugins: [
		{
			name: "verify-analytics-browser-ownership",
			generateBundle() {
				for (const id of this.getModuleIds()) {
					assert.doesNotMatch(
						id,
						/(?:plugins\/(?:ai-chat|blog|comments)\/|plugin-(?:ai-chat|blog|comments)|@btst\/components\/)/,
					);
				}
			},
		},
		...shared.plugins,
	],
};
