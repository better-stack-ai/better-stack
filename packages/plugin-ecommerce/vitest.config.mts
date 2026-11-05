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
				find: /^@btst\/plugin-cms\/api$/,
				replacement: core("../../plugin-cms/src/api/index.ts"),
			},
			{
				find: /^@btst\/plugin-cms\/permissions$/,
				replacement: core("../../plugin-cms/src/permissions.ts"),
			},
			{
				find: /^@btst\/plugin-media\/api$/,
				replacement: core("../../plugin-media/src/api/index.ts"),
			},
			{
				find: /^@btst\/stack\/context$/,
				replacement: core("context/index.ts"),
			},
			{ find: /^@btst\/stack\/client$/, replacement: core("client/index.ts") },
			{
				find: /^@btst\/stack\/client\/hooks$/,
				replacement: core("client/hooks/index.ts"),
			},
			{
				find: /^@btst\/stack\/client\/components$/,
				replacement: core("client/components/index.tsx"),
			},
			{
				find: /^@btst\/stack\/plugins\/client$/,
				replacement: core("plugins/client/index.ts"),
			},
			{
				find: /^@btst\/stack\/plugins\/client\/hooks$/,
				replacement: core("plugins/client/hooks/index.tsx"),
			},
			{
				find: /^@btst\/stack\/authorization\/client$/,
				replacement: core("authorization/client.tsx"),
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
