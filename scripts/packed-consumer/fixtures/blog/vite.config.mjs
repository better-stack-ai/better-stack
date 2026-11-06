import shared from "./browser-guard.mjs";

import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const commonjs = process.env.BLOG_CJS === "1";
const entries = [
	"client",
	"client/components",
	"client/pages/post",
	"permissions",
];
const alias = commonjs
	? entries.map((entry) => {
			const name = `@btst/plugin-blog/${entry}`;
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
			name: "verify-blog-independent-browser-graph",
			generateBundle() {
				for (const id of this.getModuleIds()) {
					assert.doesNotMatch(
						id,
						/(?:plugins\/(?:ai-chat|newsletter)\/|plugin-(?:ai-chat|newsletter)|@btst\/components\/)/,
					);
				}
			},
		},
		...shared.plugins,
	],
};
