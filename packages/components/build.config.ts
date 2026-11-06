import { readFileSync, writeFileSync } from "node:fs";
import { packageBuild } from "../../scripts/package-build";

const builds = packageBuild([
	"src/markdown/index",
	"src/auto-form/index",
	"src/stepped-auto-form/index",
	"src/form-builder/index",
	"src/multi-select/index",
	"src/search-select/index",
	"src/empty/index",
]);

for (const config of builds) {
	const copyStyles = config.hooks?.["rollup:done"];
	config.hooks ??= {};
	config.hooks["rollup:done"] = async (context) => {
		await copyStyles?.(context);
		const css = readFileSync("../ui/src/styles/components.css", "utf8").replace(
			/@source\s+"[^"]+";/g,
			"",
		);
		writeFileSync("dist/ui.css", `${css}\n@source "./**/*.{mjs,cjs}";\n`);
	};
}

export default builds;
