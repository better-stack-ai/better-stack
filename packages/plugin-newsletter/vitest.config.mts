import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const core = (path: string) =>
	fileURLToPath(new URL(`../stack/src/${path}`, import.meta.url));

export default defineConfig({
	test: {
		include: ["src/**/*.test.{ts,tsx}"],
		environment: "node",
		globals: true,
		execArgv: ["--expose-gc"],
	},
	resolve: {
		alias: [
			{
				find: /^@btst\/plugin-blog\/client$/,
				replacement: fileURLToPath(
					new URL("../plugin-blog/src/client/index.ts", import.meta.url),
				),
			},
			{
				find: /^@btst\/plugin-blog\/client\/hooks$/,
				replacement: fileURLToPath(
					new URL("../plugin-blog/src/client/hooks/index.tsx", import.meta.url),
				),
			},
			{
				find: /^@btst\/plugin-newsletter\/client\/blog-integration$/,
				replacement: fileURLToPath(
					new URL("./src/client/blog-integration.tsx", import.meta.url),
				),
			},
			{
				find: /^@btst\/plugin-newsletter\/client\/components$/,
				replacement: fileURLToPath(
					new URL("./src/client/components/index.tsx", import.meta.url),
				),
			},
			{
				find: /^@btst\/plugin-newsletter\/client$/,
				replacement: fileURLToPath(
					new URL("./src/client/index.ts", import.meta.url),
				),
			},
			{ find: /^@btst\/stack\/client$/, replacement: core("client/index.ts") },
			{
				find: /^@btst\/stack\/context$/,
				replacement: core("context/index.ts"),
			},
			{
				find: /^@btst\/stack\/plugins\/client$/,
				replacement: core("plugins/client/index.ts"),
			},
			{
				find: /^@btst\/stack\/plugins\/client\/hooks$/,
				replacement: core("plugins/client/hooks/index.tsx"),
			},
			{ find: /^@btst\/stack\/api$/, replacement: core("api/index.ts") },
			{
				find: /^@btst\/stack\/authorization\/server$/,
				replacement: core("authorization/server.ts"),
			},
			{
				find: /^@btst\/stack\/authorization$/,
				replacement: core("authorization/index.ts"),
			},
			{
				find: /^@btst\/stack\/plugins\/api$/,
				replacement: core("plugins/api/index.ts"),
			},
			{
				find: /^@btst\/stack\/page-context$/,
				replacement: core("page-context.tsx"),
			},
		],
	},
});
