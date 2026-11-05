import assert from "node:assert/strict";
import { createRequire, isBuiltin } from "node:module";
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
				)
					throw new Error(`Node built-in reached the browser consumer: ${id}`);
			},
		},
	],
};
