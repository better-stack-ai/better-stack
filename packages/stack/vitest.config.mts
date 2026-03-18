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
			// Stub for @vercel/blob/server — this subpath doesn't exist in all
			// installed versions of @vercel/blob. Tests mock this module via vi.mock.
			"@vercel/blob/server": path.resolve(
				__dirname,
				"./src/plugins/media/__tests__/__stubs__/vercel-blob-server.ts",
			),
		},
	},
});
