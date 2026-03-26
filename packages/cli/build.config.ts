import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	clean: true,
	outDir: "dist",
	entries: ["./src/index.ts"],
	rollup: {
		emitCJS: true,
		esbuild: {
			target: "node22",
		},
	},
	externals: [],
});
