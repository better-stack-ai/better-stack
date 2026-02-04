#!/usr/bin/env node
/*
  Post-build step for BTST package.
  - Copies all .css files from src/plugins/** to dist/plugins/** preserving structure
  - Executes optional per-plugin postbuild scripts if present at:
    src/plugins/<plugin>/postbuild.(js|cjs|mjs)
*/

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC_PLUGINS_DIR = path.join(ROOT, "src", "plugins");
const DIST_PLUGINS_DIR = path.join(ROOT, "dist", "plugins");

function ensureDir(dirPath) {
	if (!fs.existsSync(dirPath)) {
		fs.mkdirSync(dirPath, { recursive: true });
	}
}

function copyFilePreserveDirs(srcFile, srcRoot, distRoot) {
	const relative = path.relative(srcRoot, srcFile);
	const destFile = path.join(distRoot, relative);
	ensureDir(path.dirname(destFile));
	fs.copyFileSync(srcFile, destFile);
	console.log(`@btst/stack: copied ${relative} to ${destFile}`);
}

function* walk(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walk(fullPath);
		} else if (entry.isFile()) {
			yield fullPath;
		}
	}
}

function copyAllPluginCss() {
	console.log(`@btst/stack: running copyAllPluginCss`);
	if (!fs.existsSync(SRC_PLUGINS_DIR)) return;
	for (const pluginName of fs.readdirSync(SRC_PLUGINS_DIR)) {
		const srcPluginDir = path.join(SRC_PLUGINS_DIR, pluginName);
		if (!fs.statSync(srcPluginDir).isDirectory()) continue;
		for (const filePath of walk(srcPluginDir)) {
			if (filePath.endsWith(".css")) {
				copyFilePreserveDirs(filePath, SRC_PLUGINS_DIR, DIST_PLUGINS_DIR);
			}
		}
	}
}

function runPerPluginPostbuilds() {
	if (!fs.existsSync(SRC_PLUGINS_DIR)) return;
	const candidates = ["postbuild.js", "postbuild.cjs", "postbuild.mjs"];
	for (const pluginName of fs.readdirSync(SRC_PLUGINS_DIR)) {
		const srcPluginDir = path.join(SRC_PLUGINS_DIR, pluginName);
		if (!fs.statSync(srcPluginDir).isDirectory()) continue;

		const scriptPath = candidates
			.map((n) => path.join(srcPluginDir, n))
			.find((p) => fs.existsSync(p));

		if (scriptPath) {
			const env = {
				...process.env,
				BTST_ROOT: ROOT,
				BTST_SRC_PLUGINS_DIR: SRC_PLUGINS_DIR,
				BTST_DIST_PLUGINS_DIR: DIST_PLUGINS_DIR,
				BTST_PLUGIN_NAME: pluginName,
				BTST_SRC_PLUGIN_DIR: srcPluginDir,
				BTST_DIST_PLUGIN_DIR: path.join(DIST_PLUGINS_DIR, pluginName),
			};
			console.log(`@btst/stack: running ${path.relative(ROOT, scriptPath)}`);
			const res = spawnSync(process.execPath, [scriptPath], {
				cwd: ROOT,
				stdio: "inherit",
				env,
			});
			if (res.status !== 0) {
				console.warn(
					`@btst/stack: postbuild script for plugin "${pluginName}" exited with code ${res.status}`,
				);
			}
		}
	}
}

function main() {
	ensureDir(DIST_PLUGINS_DIR);
	copyAllPluginCss();
	runPerPluginPostbuilds();
}

main();
