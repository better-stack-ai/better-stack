import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
	test: { include: ["benchmarks/reverse-relations.ts"], testTimeout: 120_000 },
	resolve: {
		alias: {
			"../src/api/getters": resolve(
				process.env.CMS_BENCH_GETTERS ?? "src/api/getters.ts",
			),
		},
	},
});
