import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Empty, EmptyTitle } from "@btst/components/empty";
import { build } from "vite";

const require = createRequire(import.meta.url);
for (const name of [
	"@btst/stack",
	"@btst/plugin-blog/api",
	"@btst/plugin-form-builder/api",
]) {
	assert.throws(() => require.resolve(name), /Cannot find module|No "exports"/);
}
assert.match(
	renderToStaticMarkup(
		createElement(
			Empty,
			null,
			createElement(EmptyTitle, null, "ESM standalone"),
		),
	),
	/ESM standalone/,
);
const commonjs = require("@btst/components/empty");
assert.match(
	renderToStaticMarkup(
		createElement(
			commonjs.Empty,
			null,
			createElement(commonjs.EmptyTitle, null, "CJS standalone"),
		),
	),
	/CJS standalone/,
);
// Milkdown Kit publishes ESM-only subpaths, including those used by Crepe's
// CommonJS build. Allow their import condition while pinning BTST to its real
// require entries so this check cannot silently exercise BTST's ESM build.
const entries = [
	"markdown",
	"auto-form",
	"stepped-auto-form",
	"form-builder",
	"multi-select",
	"search-select",
	"empty",
];
const alias = entries.map((entry) => {
	const find = `@btst/components/${entry}`;
	const replacement = require.resolve(find);
	assert.match(replacement, /\.cjs$/);
	return { find: new RegExp(`^${find}$`), replacement };
});
await build({
	resolve: { conditions: ["module", "browser", "production", "import"], alias },
	build: { emptyOutDir: false, rollupOptions: { input: "commonjs.html" } },
});
console.log(
	"Standalone installation, native ESM/CJS Empty rendering and CommonJS browser bundle passed",
);
