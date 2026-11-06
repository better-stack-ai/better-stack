import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		include: ["src/**/*.test.{ts,tsx}"],
		globals: true,
		environment: "node",
		execArgv: ["--expose-gc"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@btst/stack/page-context": path.resolve(
				__dirname,
				"./src/page-context.tsx",
			),
			// Self-import plugin primitives from source so operation descriptors and
			// their module-private executors share one module identity in tests.
			"@btst/stack/plugins/api": path.resolve(
				__dirname,
				"./src/plugins/api/index.ts",
			),
		},
	},
});
