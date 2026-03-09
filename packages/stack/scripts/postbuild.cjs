#!/usr/bin/env node
/*
  Post-build step for BTST package.
  - Copies all .css files from src/plugins/** to dist/plugins/** preserving structure
  - Copies all .css files from src/components/** to dist/components/** preserving structure
  - Resolves @workspace/ui/... CSS imports by inlining the referenced content directly
    into each dist CSS file — producing fully self-contained files with no workspace
    references, so npm consumers and StackBlitz never see unresolvable imports
  - Executes optional per-plugin postbuild scripts if present at:
    src/plugins/<plugin>/postbuild.(js|cjs|mjs)
*/

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SRC_PLUGINS_DIR = path.join(ROOT, "src", "plugins");
const DIST_PLUGINS_DIR = path.join(ROOT, "dist", "plugins");
const SRC_COMPONENTS_DIR = path.join(ROOT, "src", "components");
const DIST_COMPONENTS_DIR = path.join(ROOT, "dist", "components");

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

function copyAllComponentCss() {
	console.log(`@btst/stack: running copyAllComponentCss`);
	if (!fs.existsSync(SRC_COMPONENTS_DIR)) return;
	for (const componentName of fs.readdirSync(SRC_COMPONENTS_DIR)) {
		const srcComponentDir = path.join(SRC_COMPONENTS_DIR, componentName);
		if (!fs.statSync(srcComponentDir).isDirectory()) continue;
		for (const filePath of walk(srcComponentDir)) {
			if (filePath.endsWith(".css")) {
				copyFilePreserveDirs(filePath, SRC_COMPONENTS_DIR, DIST_COMPONENTS_DIR);
			}
		}
	}
}

/**
 * Recursively inline relative @import statements in a CSS file, producing a
 * single blob of CSS with no relative imports left. Non-relative imports
 * (e.g. "tailwindcss", bare package names) are kept as-is.
 */
function inlineCssImports(cssContent, baseDir, seen = new Set()) {
	return cssContent.replace(
		/^@import\s+"([^"]+)";?[ \t]*$/gm,
		(match, importPath) => {
			if (!importPath.startsWith("./") && !importPath.startsWith("../")) {
				return match;
			}
			const resolved = path.resolve(baseDir, importPath);
			if (seen.has(resolved)) return "";
			if (!fs.existsSync(resolved)) return match;
			seen.add(resolved);
			const content = fs.readFileSync(resolved, "utf8");
			return inlineCssImports(content, path.dirname(resolved), seen);
		},
	);
}

/**
 * After all plugin CSS files are copied to dist, scan them for
 * @import "@workspace/ui/..." declarations and inline the referenced CSS
 * content directly — replacing the import with the full CSS text.
 *
 * This makes every dist CSS file fully self-contained: no @workspace/ui
 * references survive into the published npm package, so consumers outside
 * the monorepo (npm installs, StackBlitz) never see unresolvable imports.
 *
 * Strategy: inline rather than redirect to a shared/ file, so the package
 * works correctly with no extra files and no relative-path assumptions.
 */
function resolveWorkspaceCssImports() {
	const UI_PKG_DIR = path.resolve(ROOT, "..", "ui");
	const UI_PKG_JSON = path.join(UI_PKG_DIR, "package.json");
	if (!fs.existsSync(UI_PKG_JSON)) {
		console.warn(
			"@btst/stack: packages/ui not found — skipping workspace CSS resolution",
		);
		return;
	}

	const uiExports =
		JSON.parse(fs.readFileSync(UI_PKG_JSON, "utf8")).exports || {};

	function resolveUiSpecifier(specifier) {
		// "@workspace/ui/components/foo/bar.css" → "./components/foo/bar.css"
		const subpath = specifier.replace("@workspace/ui", ".");
		const exportEntry = uiExports[subpath];
		if (!exportEntry) return null;
		return path.resolve(UI_PKG_DIR, exportEntry);
	}

	const WORKSPACE_IMPORT_RE = /@import\s+"(@workspace\/ui[^"]+)";?[ \t]*/g;

	// Cache resolved+inlined content per specifier so each unique import is
	// only read and processed once even if referenced by multiple dist files.
	const cache = new Map();

	function processDistDir(distDir) {
		if (!fs.existsSync(distDir)) return;
		for (const filePath of walk(distDir)) {
			if (!filePath.endsWith(".css")) continue;

			let content = fs.readFileSync(filePath, "utf8");
			if (!WORKSPACE_IMPORT_RE.test(content)) continue;
			WORKSPACE_IMPORT_RE.lastIndex = 0;

			let modified = false;

			content = content.replace(WORKSPACE_IMPORT_RE, (match, specifier) => {
				if (!cache.has(specifier)) {
					const resolvedPath = resolveUiSpecifier(specifier);
					if (!resolvedPath || !fs.existsSync(resolvedPath)) {
						console.warn(
							`@btst/stack: could not resolve workspace import: ${specifier}`,
						);
						cache.set(specifier, null);
						return match;
					}
					const raw = fs.readFileSync(resolvedPath, "utf8");
					// Recursively inline any relative sub-imports within the resolved file
					const inlined = inlineCssImports(raw, path.dirname(resolvedPath));
					cache.set(specifier, inlined);
					console.log(
						`@btst/stack: inlined workspace import "${specifier}" into ${path.relative(distDir, filePath)}`,
					);
				}
				const inlined = cache.get(specifier);
				if (inlined === null) return match; // could not resolve — keep original
				modified = true;
				return inlined;
			});

			if (modified) {
				fs.writeFileSync(filePath, content);
				console.log(
					`@btst/stack: rewrote workspace imports in ${path.relative(distDir, filePath)}`,
				);
			}
		}
	}

	processDistDir(DIST_PLUGINS_DIR);
	processDistDir(DIST_COMPONENTS_DIR);
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
	ensureDir(DIST_COMPONENTS_DIR);
	copyAllPluginCss();
	copyAllComponentCss();
	resolveWorkspaceCssImports();
	runPerPluginPostbuilds();
}

main();
