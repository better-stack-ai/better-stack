import shared from "./browser-guard.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const commonjs = process.env.NOTIFICATIONS_CJS === "1";
const entries = [
	"@btst/plugin-notifications/client",
	"@btst/plugin-notifications/client/components",
	"@btst/plugin-notifications/permissions",
	"@btst/stack/client",
	"@btst/stack/context",
	"@btst/stack/authorization",
	"@btst/stack/authorization/client",
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
	plugins: [...shared.plugins],
};
