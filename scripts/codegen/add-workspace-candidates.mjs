import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// These E2E setups select every built-in plugin with --skip-install.
const packages = fileURLToPath(new URL("../../packages", import.meta.url));
const target = process.argv[2];
const project = JSON.parse(await readFile(target, "utf8"));
project.dependencies ??= {};
for (const entry of await readdir(packages, { withFileTypes: true })) {
	if (!entry.isDirectory()) continue;
	const candidate = JSON.parse(
		await readFile(join(packages, entry.name, "package.json"), "utf8"),
	);
	if (
		candidate.name !== "@btst/stack" &&
		!candidate.name.startsWith("@btst/plugin-")
	)
		continue;
	project.dependencies[candidate.name] = "workspace:*";
	if (project.devDependencies) delete project.devDependencies[candidate.name];
}
await writeFile(target, `${JSON.stringify(project, null, 2)}\n`);
