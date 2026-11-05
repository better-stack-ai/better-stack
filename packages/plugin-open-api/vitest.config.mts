import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const core = (path: string) =>
	fileURLToPath(new URL(`../stack/src/${path}`, import.meta.url));

export default defineConfig({
	test: { include: ["src/**/*.test.ts"], environment: "node", globals: true },
	resolve: {
		alias: [
			{ find: /^@btst\/stack\/api$/, replacement: core("api/index.ts") },
			{
				find: /^@btst\/stack\/plugins\/api$/,
				replacement: core("plugins/api/index.ts"),
			},
			{
				find: /^@btst\/stack\/authorization$/,
				replacement: core("authorization/index.ts"),
			},
			{
				find: /^@btst\/stack\/authorization\/server$/,
				replacement: core("authorization/server.ts"),
			},
		],
	},
});
