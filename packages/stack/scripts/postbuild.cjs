#!/usr/bin/env node
/*
  Post-build step for BTST package.
  - Copies all .css files from src/plugins/** to dist/plugins/** preserving structure
  - Resolves @workspace/ui/... CSS imports in dist files by inlining the referenced
    content into dist/plugins/shared/ and rewriting the import path — so consumers
    outside the monorepo (e.g. npm installs, StackBlitz) never see workspace imports
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
 * @import "@workspace/ui/..." declarations. For each unique specifier found:
 *   1. Resolve the actual file via packages/ui/package.json exports map
 *   2. Inline all relative sub-imports recursively into one blob
 *   3. Write the blob to dist/plugins/shared/<slug>.css
 *   4. Rewrite the @workspace/ui/... import in the dist CSS to the relative path
 *
 * This keeps source files using proper workspace imports while ensuring the
 * published package is self-contained.
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
	const sharedDir = path.join(DIST_PLUGINS_DIR, "shared");

	// specifier → filename written in dist/plugins/shared/
	const generated = new Map();

	if (!fs.existsSync(DIST_PLUGINS_DIR)) return;

	for (const filePath of walk(DIST_PLUGINS_DIR)) {
		if (!filePath.endsWith(".css")) continue;

		let content = fs.readFileSync(filePath, "utf8");
		if (!WORKSPACE_IMPORT_RE.test(content)) continue;
		WORKSPACE_IMPORT_RE.lastIndex = 0;

		let modified = false;

		content = content.replace(WORKSPACE_IMPORT_RE, (match, specifier) => {
			if (!generated.has(specifier)) {
				const resolvedPath = resolveUiSpecifier(specifier);
				if (!resolvedPath || !fs.existsSync(resolvedPath)) {
					console.warn(
						`@btst/stack: could not resolve workspace import: ${specifier}`,
					);
					return match;
				}
				const raw = fs.readFileSync(resolvedPath, "utf8");
				const inlined = inlineCssImports(raw, path.dirname(resolvedPath));
				// Derive a stable filename from the specifier
				const slug = specifier
					.replace("@workspace/ui/", "")
					.replace(/\//g, "-");
				ensureDir(sharedDir);
				const destPath = path.join(sharedDir, slug);
				fs.writeFileSync(destPath, inlined);
				generated.set(specifier, slug);
				console.log(
					`@btst/stack: resolved workspace import "${specifier}" → shared/${slug}`,
				);
			}
			const slug = generated.get(specifier);
			const rel = path.relative(
				path.dirname(filePath),
				path.join(sharedDir, slug),
			);
			const relNormalized = rel.startsWith(".") ? rel : `./${rel}`;
			modified = true;
			return `@import "${relNormalized}";`;
		});

		if (modified) {
			fs.writeFileSync(filePath, content);
			console.log(
				`@btst/stack: rewrote workspace imports in ${path.relative(DIST_PLUGINS_DIR, filePath)}`,
			);
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
	resolveWorkspaceCssImports();
	runPerPluginPostbuilds();
}

main();
