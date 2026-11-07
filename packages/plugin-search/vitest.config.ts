import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@btst/plugin-cms/api": fileURLToPath(
				new URL("../plugin-cms/src/api/index.ts", import.meta.url),
			),
			"@btst/plugin-media/api": fileURLToPath(
				new URL("../plugin-media/src/api/index.ts", import.meta.url),
			),
		},
	},
});
