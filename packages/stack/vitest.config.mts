import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		poolOptions: {
			forks: {
				execArgv: ["--expose-gc"],
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			// Self-import plugin primitives from source so operation descriptors and
			// their module-private executors share one module identity in tests.
			"@btst/stack/plugins/api": path.resolve(
				__dirname,
				"./src/plugins/api/index.ts",
			),
			// Stub for @vercel/blob/server — this subpath doesn't exist in all
			// installed versions of @vercel/blob. Tests mock this module via vi.mock.
			"@vercel/blob/server": path.resolve(
				__dirname,
				"./src/plugins/media/__tests__/__stubs__/vercel-blob-server.ts",
			),
		},
	},
});
