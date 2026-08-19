/**
 * Build script for the BTST shadcn registry.
 *
 * Produces per-plugin JSON files + a combined registry.json under
 * packages/stack/registry/.  Consumers install a plugin's UI layer via:
 *
 *   npx shadcn@latest add "https://raw.githubusercontent.com/…/registry/btst-blog.json"
 *
 * Design notes:
 * - Plugin source files (client/components/**, localization/**, overrides.ts)
 *   are included with their directory structure preserved so that all
 *   relative imports remain valid in the consumer project.
 * - Hooks are intentionally EXCLUDED; references to them inside components
 *   are rewritten to @btst/stack/plugins/{name}/client/hooks so that the
 *   npm package provides the data-fetching layer.
 * - @workspace/ui imports are rewritten to @/... (standard shadcn paths).
 *   Standard shadcn components become registryDependencies; custom
 *   workspace/ui components (page-wrapper, empty, …) are included as
 *   registry:component files pulled from packages/ui/src/.
 * - All output is validated against the Zod schema before writing.
 */

import { readFile, writeFile, mkdir, access, stat } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { resolve, relative, basename, dirname, join, sep } from "node:path";
import {
	registryItemSchema,
	registrySchema,
	type RegistryItem,
	type RegistryItemFile,
	type RegistryItemType,
	type Registry,
} from "./schema.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// This script is always executed from packages/stack/ via the npm script.
// process.cwd() is the package root; the monorepo root is two levels up.
const PACKAGE_DIR = process.cwd();
const WORKSPACE_ROOT = resolve(PACKAGE_DIR, "../..");
const STACK_PLUGINS_DIR = resolve(PACKAGE_DIR, "src/plugins");
const UI_COMPONENTS_DIR = resolve(WORKSPACE_ROOT, "packages/ui/src/components");
const UI_HOOKS_DIR = resolve(WORKSPACE_ROOT, "packages/ui/src/hooks");
const OUTPUT_DIR = resolve(PACKAGE_DIR, "registry");

// ---------------------------------------------------------------------------
// Multi-file / directory-based workspace/ui components.
// These cannot be embedded as single files; instead their external shadcn
// registry URL is added to registryDependencies so the CLI fetches them.
// ---------------------------------------------------------------------------

const EXTERNAL_REGISTRY_COMPONENTS: Record<string, string> = {
	"auto-form":
		"https://raw.githubusercontent.com/better-stack-ai/form-builder/refs/heads/main/registry/auto-form.json",
	"form-builder":
		"https://raw.githubusercontent.com/better-stack-ai/form-builder/refs/heads/main/registry/form-builder.json",
	"minimal-tiptap":
		"https://raw.githubusercontent.com/olliethedev/shadcn-minimal-tiptap/refs/heads/feat/image-upload-config/registry/block-registry.json",
	"ui-builder":
		"https://raw.githubusercontent.com/olliethedev/ui-builder/refs/heads/main/registry/block-registry.json",
};

// ---------------------------------------------------------------------------
// Standard shadcn component names
// These go into registryDependencies, not as embedded files.
// ---------------------------------------------------------------------------

// Components excluded from the shadcn standard-install list and instead
// embedded directly from packages/ui/src/components/<name>.tsx:
//
// "form" — Both shadcn styles (base-nova / radix-nova) return an empty JSON
//   for the form component (no files). The form.tsx in the workspace is fully
//   functional. Plugins that use it must add "react-hook-form" and
//   "@hookform/resolvers" to extraNpmDeps.
//
// "accordion" is deliberately kept in this set — when the test uses
// `shadcn init --base radix` the radix-nova style installs the Radix-based
// accordion which has the correct `type` / `collapsible` API. The workspace
// accordion is still embedded for plugins (ai-chat, ui-builder) that import it
// directly, but shadcn's radix-nova accordion is the fallback for others.
const STANDARD_SHADCN_COMPONENTS = new Set([
	"accordion",
	"alert",
	"alert-dialog",
	"aspect-ratio",
	"avatar",
	"badge",
	"breadcrumb",
	"button",
	"calendar",
	"card",
	"carousel",
	"chart",
	"checkbox",
	"collapsible",
	"command",
	"context-menu",
	"dialog",
	"drawer",
	"dropdown-menu",
	"hover-card",
	"input",
	"input-otp",
	"label",
	"menubar",
	"navigation-menu",
	"pagination",
	"popover",
	"progress",
	"radio-group",
	"resizable",
	"scroll-area",
	"select",
	"separator",
	"sheet",
	"sidebar",
	"skeleton",
	"slider",
	"sonner",
	"switch",
	"table",
	"tabs",
	"textarea",
	"toast",
	"toggle",
	"toggle-group",
	"tooltip",
]);

// ---------------------------------------------------------------------------
// Plugin configurations
// ---------------------------------------------------------------------------

interface PluginConfig {
	/** Plugin directory name inside packages/stack/src/plugins/ */
	name: string;
	title: string;
	description: string;
	/** npm packages to declare in the registry item's dependencies array */
	extraNpmDeps: string[];
	/** npm packages to declare in the registry item's devDependencies array (e.g. @types/* packages) */
	extraNpmDevDeps?: string[];
	/** Extra registryDependencies (e.g. external 3rd-party registry URLs) */
	extraRegistryDeps: string[];
	/**
	 * Workspace UI components to force-embed regardless of whether they're
	 * directly imported by plugin source files. Useful when an external registry
	 * dependency (e.g. auto-form) imports a workspace-only component (e.g.
	 * date-picker) that isn't declared in that registry's own registryDependencies.
	 */
	extraWorkspaceUiComponents?: string[];
	/**
	 * Files from the plugin root directory (alongside api/ and client/) to embed
	 * as registry:lib entries. These are placed at src/components/btst/{name}/{file}
	 * so that relative imports from client components resolve correctly without
	 * any import rewriting (the directory depth is identical in both source and
	 * consumer project layouts).
	 */
	pluginRootFiles: string[];
}

const PLUGINS: PluginConfig[] = [
	{
		name: "blog",
		title: "Blog Plugin Pages",
		description:
			"Ejectable page components for the @btst/stack blog plugin. " +
			"Customize the UI layer while keeping data-fetching in @btst/stack.",
		extraNpmDeps: [
			"@milkdown/crepe",
			"@milkdown/kit",
			"date-fns",
			"highlight.js",
			"react-markdown",
			"rehype-highlight",
			"rehype-katex",
			"rehype-raw",
			"remark-gfm",
			"remark-math",
			// form.tsx is embedded from workspace (shadcn new-nova styles have no
			// files for form), so declare its peer deps explicitly.
			"react-hook-form",
			"@hookform/resolvers",
			// slug is used in utils.ts (slugify helper)
			"slug",
		],
		// slug ships without bundled TypeScript types; @types/slug is needed
		// in any strict-mode TS project.
		extraNpmDevDeps: ["@types/slug"],
		extraRegistryDeps: [],
		pluginRootFiles: ["types.ts", "schemas.ts", "utils.ts"],
	},
	{
		name: "ai-chat",
		title: "AI Chat Plugin Pages",
		description:
			"Ejectable page components for the @btst/stack ai-chat plugin. " +
			"Customize the UI layer while keeping data-fetching in @btst/stack.",
		extraNpmDeps: [
			"@ai-sdk/react",
			"ai",
			"highlight.js",
			// chat-message.tsx uses remend to sanitise partial markdown during streaming
			"remend",
			// markdown-content.tsx (embedded from @workspace/ui) uses these for rendering
			"react-markdown",
			"rehype-highlight",
			"rehype-raw",
			"remark-gfm",
		],
		extraRegistryDeps: [],
		// ai-chat has no utils.ts; schemas.ts only imports zod (already a core dep)
		pluginRootFiles: ["types.ts", "schemas.ts"],
	},
	{
		name: "cms",
		title: "CMS Plugin Pages",
		description:
			"Ejectable page components for the @btst/stack cms plugin. " +
			"Customize the UI layer while keeping data-fetching in @btst/stack.",
		extraNpmDeps: [
			"react-hook-form",
			"@hookform/resolvers",
			"zod",
			// slug is used in utils.ts (slugify helper)
			"slug",
		],
		extraNpmDevDeps: ["@types/slug"],
		extraRegistryDeps: [],
		// auto-form's date field imports @/components/ui/date-picker which is not
		// in the radix-nova registry — embed it from workspace explicitly.
		extraWorkspaceUiComponents: ["date-picker"],
		pluginRootFiles: ["types.ts", "schemas.ts", "utils.ts"],
	},
	{
		name: "form-builder",
		title: "Form Builder Plugin Pages",
		description:
			"Ejectable page components for the @btst/stack form-builder plugin. " +
			"Customize the UI layer while keeping data-fetching in @btst/stack.",
		extraNpmDeps: [
			"react-hook-form",
			"@hookform/resolvers",
			"zod",
			// slug is used in utils.ts (slugify helper)
			"slug",
		],
		extraNpmDevDeps: ["@types/slug"],
		extraRegistryDeps: [],
		// auto-form's date field imports @/components/ui/date-picker which is not
		// in the radix-nova registry — embed it from workspace explicitly.
		extraWorkspaceUiComponents: ["date-picker"],
		pluginRootFiles: ["types.ts", "schemas.ts", "utils.ts"],
	},
	{
		name: "kanban",
		title: "Kanban Plugin Pages",
		description:
			"Ejectable page components for the @btst/stack kanban plugin. " +
			"Customize the UI layer while keeping data-fetching in @btst/stack.",
		extraNpmDeps: [
			"date-fns",
			"@dnd-kit/core",
			"@dnd-kit/sortable",
			"@dnd-kit/utilities",
			// search-select.tsx uses @radix-ui/react-popover directly (no portal)
			"@radix-ui/react-popover",
		],
		extraRegistryDeps: [],
		// kanban/utils.ts has no external npm imports (pure utility functions)
		pluginRootFiles: ["types.ts", "schemas.ts", "utils.ts"],
	},
	{
		name: "comments",
		title: "Comments Plugin Pages",
		description:
			"Ejectable page components for the @btst/stack comments plugin. " +
			"Customize the UI layer while keeping data-fetching in @btst/stack.",
		extraNpmDeps: ["date-fns"],
		extraRegistryDeps: [],
		pluginRootFiles: ["types.ts", "schemas.ts"],
	},
	{
		name: "ui-builder",
		title: "UI Builder Plugin Pages",
		description:
			"Ejectable page components for the @btst/stack ui-builder plugin. " +
			"Customize the UI layer while keeping data-fetching in @btst/stack.",
		extraNpmDeps: ["zod"],
		// Note: the UI Builder registry component (@workspace/ui/components/ui-builder)
		// is handled via EXTERNAL_REGISTRY_COMPONENTS and added to registryDependencies
		// automatically when detected in imports.
		extraRegistryDeps: [],
		// schemas.ts has a cross-plugin import (../cms/types) and is only used by
		// hook files (excluded). Only types.ts is needed by ejected components.
		pluginRootFiles: ["types.ts"],
	},
	{
		name: "media",
		title: "Media Plugin Pages",
		description:
			"Ejectable page components for the @btst/stack media plugin. " +
			"Customize the UI layer while keeping data-fetching in @btst/stack.",
		// @vercel/blob is required by @btst/stack's use-media hook even when using
		// "direct" upload mode — Turbopack statically resolves dynamic imports so
		// the package must be present at build time.
		extraNpmDeps: ["@vercel/blob"],
		extraRegistryDeps: [],
		pluginRootFiles: ["types.ts", "schemas.ts"],
	},
];

// ---------------------------------------------------------------------------
// File-type classification
// ---------------------------------------------------------------------------

/**
 * Determines the registry item type for a file based on its path within
 * the plugin's client/ directory.
 */
function classifyClientFile(relPath: string): RegistryItemType {
	if (relPath.endsWith(".css")) return "registry:file";

	// Hooks directory (these stay in the npm package, but if included they'd be hooks)
	if (relPath.startsWith("hooks/") || relPath.includes("/hooks/")) {
		return "registry:hook";
	}

	// Localization constants and override types = lib
	if (relPath.startsWith("localization/") || relPath === "overrides.ts") {
		return "registry:lib";
	}

	// Page wrapper components (not .internal.) = registry:page
	if (
		relPath.includes("pages/") &&
		!relPath.includes(".internal.") &&
		relPath.endsWith(".tsx")
	) {
		return "registry:page";
	}

	// Plain .ts files (non-hooks, non-localization) = lib
	if (relPath.endsWith(".ts")) {
		return "registry:lib";
	}

	// Shared / forms / loading / components = component
	return "registry:component";
}

// ---------------------------------------------------------------------------
// Exclusion logic
// ---------------------------------------------------------------------------

/**
 * Returns true if the file should be excluded from the registry.
 * Hooks are excluded because they stay in the npm package; components
 * reference them via @btst/stack/plugins/{name}/client/hooks.
 */
function shouldExclude(relPath: string): boolean {
	// Normalise separators
	const p = relPath.replace(/\\/g, "/");

	// Top-level plugin definition and client entry point
	if (p === "plugin.tsx" || p === "plugin.ts") return true;
	if (p === "index.ts" || p === "index.tsx") return true;

	// Top-level component/hook barrel index files
	const indexPattern = /\/(index)\.(ts|tsx)$/;
	if (
		p === "components/index.tsx" ||
		p === "components/index.ts" ||
		p === "hooks/index.tsx" ||
		p === "hooks/index.ts" ||
		// shared/ and forms/ index files are never imported directly by page
		// components — only specific named imports are used, so barrels are noise.
		// loading/index.tsx IS needed: page components do `from "../loading"`.
		(indexPattern.test(p) &&
			(p.startsWith("components/shared/") ||
				p.startsWith("components/forms/") ||
				p.startsWith("hooks/")))
	) {
		return true;
	}

	// Hooks directory — data layer stays in the npm package
	if (p.startsWith("hooks/")) return true;

	return false;
}

// ---------------------------------------------------------------------------
// Import rewriting
// ---------------------------------------------------------------------------

/**
 * Rewrites all @workspace/ui/* imports in a file to @/* equivalents.
 *   @workspace/ui/components/{x} → @/components/ui/{x}
 *   @workspace/ui/lib/{x}        → @/lib/{x}
 *   @workspace/ui/hooks/{x}      → @/hooks/{x}
 *   @workspace/ui/{x}.css        → @/styles/{x}.css
 */
function rewriteWorkspaceUiImports(content: string): string {
	return content
		.replace(
			/(['"])@workspace\/ui\/components\/([^'"]+)\1/g,
			(_m, q, rest) => `${q}@/components/ui/${rest}${q}`,
		)
		.replace(
			/(['"])@workspace\/ui\/lib\/([^'"]+)\1/g,
			(_m, q, rest) => `${q}@/lib/${rest}${q}`,
		)
		.replace(
			/(['"])@workspace\/ui\/hooks\/([^'"]+)\1/g,
			(_m, q, rest) => `${q}@/hooks/${rest}${q}`,
		)
		.replace(
			// CSS side-effect imports: @workspace/ui/foo.css → @/styles/foo.css
			/(['"])@workspace\/ui\/([^/'"]+\.css)\1/g,
			(_m, q, rest) => `${q}@/styles/${rest}${q}`,
		);
}

/**
 * Rewrites relative imports that resolve into the hooks/ directory to the
 * npm package path so that ejected components don't need hook source files.
 *
 * @param content   File source code
 * @param absPath   Absolute path of the source file being processed
 * @param clientDir Absolute path to the plugin's client/ directory
 * @param pluginName Plugin name (e.g. "blog")
 */
function rewriteHookImports(
	content: string,
	absPath: string,
	clientDir: string,
	pluginName: string,
): string {
	const fileDir = dirname(absPath);
	const hooksDir = join(clientDir, "hooks");

	return content.replace(
		/from\s+(['"])(\.\.?\/[^'"]+)\1/g,
		(match, q, importPath) => {
			const resolved = resolve(fileDir, importPath);
			if (
				resolved === hooksDir ||
				resolved.startsWith(hooksDir + sep) ||
				resolved.startsWith(hooksDir + "/")
			) {
				return `from ${q}@btst/stack/plugins/${pluginName}/client/hooks${q}`;
			}
			return match;
		},
	);
}

/**
 * Rewrites relative imports that resolve into the plugin's api/ directory
 * or to the top-level query-keys.ts file to the npm package export path.
 *
 * Examples rewritten:
 *   ../../api/plugin   → @btst/stack/plugins/{name}/api
 *   ../../api          → @btst/stack/plugins/{name}/api
 *   ../../query-keys   → @btst/stack/plugins/{name}/api
 *
 * The api/index.ts already re-exports everything consumers need
 * (ApiRouter types, createXxxQueryKeys, etc.).
 *
 * @param content    File source code
 * @param absPath    Absolute path of the source file being processed
 * @param pluginDir  Absolute path to the plugin root (e.g. src/plugins/ai-chat/)
 * @param pluginName Plugin name (e.g. "ai-chat")
 */
function rewriteApiAndQueryKeyImports(
	content: string,
	absPath: string,
	pluginDir: string,
	pluginName: string,
): string {
	const fileDir = dirname(absPath);
	const apiDir = join(pluginDir, "api");
	const queryKeysFile = join(pluginDir, "query-keys");

	return content.replace(
		/from\s+(['"])(\.\.?\/[^'"]+)\1/g,
		(match, q, importPath) => {
			const resolved = resolve(fileDir, importPath);

			// api/ directory (includes api/plugin, api/index, etc.)
			if (
				resolved === apiDir ||
				resolved.startsWith(apiDir + sep) ||
				resolved.startsWith(apiDir + "/")
			) {
				return `from ${q}@btst/stack/plugins/${pluginName}/api${q}`;
			}

			// top-level query-keys.ts (imports from ./api internally, so we point
			// consumers to the npm export that already re-exports it)
			if (resolved === queryKeysFile) {
				return `from ${q}@btst/stack/plugins/${pluginName}/api${q}`;
			}

			return match;
		},
	);
}

/**
 * Additional rewrites for workspace/ui source files pulled from
 * packages/ui/src/.  Their relative ../lib/ and ../components/ imports
 * must be converted to @/ aliases because their target directory in the
 * consumer project differs from their source directory.
 */
function rewriteWorkspaceUiSourceFile(
	content: string,
	srcRelPath: string,
): string {
	let result = rewriteWorkspaceUiImports(content);

	if (srcRelPath.startsWith("components/")) {
		// "../lib/utils" → "@/lib/utils" (one level up from components/)
		result = result.replace(
			/(['"])\.\.\/lib\/([^'"]+)\1/g,
			(_m, q, rest) => `${q}@/lib/${rest}${q}`,
		);
	}

	if (srcRelPath.startsWith("hooks/")) {
		// "../lib/utils" → "@/lib/utils" (one level up from hooks/)
		result = result.replace(
			/(['"])\.\.\/lib\/([^'"]+)\1/g,
			(_m, q, rest) => `${q}@/lib/${rest}${q}`,
		);
		// "../components/{x}" → "@/components/ui/{x}"
		result = result.replace(
			/(['"])\.\.\/components\/([^'"]+)\1/g,
			(_m, q, rest) => `${q}@/components/ui/${rest}${q}`,
		);
	}

	return result;
}

// ---------------------------------------------------------------------------
// Plugin root file embedding
// ---------------------------------------------------------------------------

/**
 * Reads and embeds plugin-root-level files (types.ts, schemas.ts, utils.ts)
 * as registry:lib entries placed at src/components/btst/{name}/{file}.
 *
 * Because the directory depth from client components to the plugin root is
 * identical in both the source tree and the consumer project, existing relative
 * imports (e.g. "../../../types") need NO rewriting — they resolve correctly
 * as long as the file exists at the right relative location.
 *
 * @workspace/ui imports inside root files ARE rewritten via
 * rewriteWorkspaceUiImports so that e.g. ui-builder/types.ts works.
 */
async function embedPluginRootFiles(
	pluginName: string,
	pluginDir: string,
	fileNames: string[],
): Promise<{ files: RegistryItemFile[]; uiRefs: WorkspaceUiRefs }> {
	const files: RegistryItemFile[] = [];
	const uiRefs: WorkspaceUiRefs = {
		components: new Set(),
		hooks: new Set(),
		libs: new Set(),
		cssFiles: new Set(),
	};

	for (const fileName of fileNames) {
		const absPath = join(pluginDir, fileName);
		try {
			await access(absPath);
			const fileStat = await stat(absPath);
			if (!fileStat.isFile()) continue;

			let content = await readFile(absPath, "utf-8");

			// Collect @workspace/ui refs before rewriting
			const refs = collectWorkspaceUiRefs(content);
			for (const c of refs.components) uiRefs.components.add(c);
			for (const h of refs.hooks) uiRefs.hooks.add(h);
			for (const l of refs.libs) uiRefs.libs.add(l);
			for (const css of refs.cssFiles) uiRefs.cssFiles.add(css);

			// Rewrite @workspace/ui/* → @/* (e.g. ui-builder/types.ts re-exports
			// from @workspace/ui/components/ui-builder/types)
			content = rewriteWorkspaceUiImports(content);

			files.push({
				path: `btst/${pluginName}/${fileName}`,
				type: "registry:lib",
				content,
				target: `src/components/btst/${pluginName}/${fileName}`,
			});

			console.log(`  add   ${fileName} (registry:lib) [plugin root]`);
		} catch {
			// File doesn't exist for this plugin — skip silently
		}
	}

	return { files, uiRefs };
}

// ---------------------------------------------------------------------------
// Workspace/ui dependency scanning
// ---------------------------------------------------------------------------

interface WorkspaceUiRefs {
	/** Component names after @workspace/ui/components/ */
	components: Set<string>;
	/** Hook names after @workspace/ui/hooks/ */
	hooks: Set<string>;
	/**
	 * Lib utility names after @workspace/ui/lib/ or resolved from relative
	 * imports like "../lib/{name}" inside workspace component files.
	 * These are embedded at src/lib/{name}.ts in the consumer project.
	 * Standard files provided by shadcn (utils) are excluded.
	 */
	libs: Set<string>;
	/**
	 * CSS file names (with extension) directly under @workspace/ui/*.css.
	 * These are embedded at src/styles/{name}.css in the consumer project.
	 * Example: @workspace/ui/markdown-content.css → src/styles/markdown-content.css
	 */
	cssFiles: Set<string>;
}

/** Names that shadcn always installs (live at src/lib/{name}.ts); skip embedding. */
const STANDARD_LIB_FILES = new Set(["utils"]);

/** Scans raw source content (before rewriting) for @workspace/ui references. */
function collectWorkspaceUiRefs(content: string): WorkspaceUiRefs {
	const components = new Set<string>();
	const hooks = new Set<string>();
	const libs = new Set<string>();
	const cssFiles = new Set<string>();

	// Capture the FULL path after components/ — e.g. "auto-form/stepped-auto-form"
	// as well as simple names like "accordion". The path ends at the closing quote.
	for (const [, comp] of content.matchAll(
		/['"]@workspace\/ui\/components\/([^'"]+)['"]/g,
	)) {
		components.add(comp ?? "");
	}
	for (const [, hook] of content.matchAll(
		/['"]@workspace\/ui\/hooks\/([^'"]+)['"]/g,
	)) {
		hooks.add(hook ?? "");
	}
	for (const [, lib] of content.matchAll(
		/['"]@workspace\/ui\/lib\/([^'"]+)['"]/g,
	)) {
		if (!STANDARD_LIB_FILES.has(lib ?? "")) libs.add(lib ?? "");
	}
	for (const [, css] of content.matchAll(
		/['"]@workspace\/ui\/([^/'"]+\.css)['"]/g,
	)) {
		cssFiles.add(css ?? "");
	}

	return { components, hooks, libs, cssFiles };
}

/**
 * Scans ALREADY-REWRITTEN workspace component source for @/lib/ imports
 * that originated from relative "../lib/..." paths or @workspace/ui/lib/...
 * These need to be embedded as src/lib/{name}.ts in the consumer project.
 */
function collectLibRefsFromRewritten(content: string): Set<string> {
	const libs = new Set<string>();
	for (const [, lib] of content.matchAll(/['"]@\/lib\/([^'"]+)['"]/g)) {
		if (!STANDARD_LIB_FILES.has(lib ?? "")) libs.add(lib ?? "");
	}
	return libs;
}

/** Names that shadcn always installs (live at src/hooks/{name}); skip embedding. */
const STANDARD_HOOK_FILES = new Set(["use-toast"]);

/**
 * Scans ALREADY-REWRITTEN workspace component source for @/hooks/ imports
 * that originated from @workspace/ui/hooks/... These need to be embedded
 * as src/hooks/{name}.ts in the consumer project.
 */
function collectHookRefsFromRewritten(content: string): Set<string> {
	const hooks = new Set<string>();
	for (const [, hook] of content.matchAll(/['"]@\/hooks\/([^'"]+)['"]/g)) {
		if (!STANDARD_HOOK_FILES.has(hook ?? "")) hooks.add(hook ?? "");
	}
	return hooks;
}

// ---------------------------------------------------------------------------
// Workspace/ui source file inclusion (custom, non-standard components)
// ---------------------------------------------------------------------------

/**
 * Loads a custom workspace/ui component source from packages/ui/src/components/
 * and returns a RegistryItemFile for it, or null if the file doesn't exist.
 */
async function loadWorkspaceUiComponent(
	componentName: string,
): Promise<RegistryItemFile | null> {
	// componentName may be a deep path like "auto-form/stepped-auto-form"
	const candidates = [
		join(UI_COMPONENTS_DIR, `${componentName}.tsx`),
		join(UI_COMPONENTS_DIR, `${componentName}.ts`),
	];

	for (const candidate of candidates) {
		try {
			await access(candidate);
			const rawContent = await readFile(candidate, "utf-8");
			const srcRelPath = `components/${componentName.includes("/") ? componentName + (candidate.endsWith(".tsx") ? ".tsx" : ".ts") : basename(candidate)}`;
			const content = rewriteWorkspaceUiSourceFile(rawContent, srcRelPath);
			const ext = candidate.endsWith(".tsx") ? ".tsx" : ".ts";
			const targetPath = `src/components/ui/${componentName}${ext}`;

			return {
				path: `ui/components/${componentName}${ext}`,
				type: "registry:component",
				content,
				target: targetPath,
			};
		} catch {
			// File not found, try next candidate
		}
	}
	return null;
}

/**
 * Loads a custom workspace/ui hook source from packages/ui/src/hooks/
 * and returns a RegistryItemFile for it, or null if the file doesn't exist.
 */
async function loadWorkspaceUiHook(
	hookName: string,
): Promise<RegistryItemFile | null> {
	const candidates = [
		join(UI_HOOKS_DIR, `${hookName}.ts`),
		join(UI_HOOKS_DIR, `${hookName}.tsx`),
	];

	for (const candidate of candidates) {
		try {
			await access(candidate);
			const rawContent = await readFile(candidate, "utf-8");
			const srcRelPath = `hooks/${basename(candidate)}`;
			const content = rewriteWorkspaceUiSourceFile(rawContent, srcRelPath);
			const ext = candidate.endsWith(".tsx") ? ".tsx" : ".ts";
			const targetPath = `src/hooks/${hookName}${ext}`;

			return {
				path: `ui/hooks/${hookName}${ext}`,
				type: "registry:hook",
				content,
				target: targetPath,
			};
		} catch {
			// File not found, try next candidate
		}
	}
	return null;
}

/**
 * Loads a workspace/ui lib utility from packages/ui/src/lib/ and returns a
 * RegistryItemFile targeting src/lib/{name}.ts in the consumer project.
 */
async function loadWorkspaceUiLib(
	libName: string,
): Promise<RegistryItemFile | null> {
	const UI_LIB_DIR = resolve(WORKSPACE_ROOT, "packages/ui/src/lib");
	const candidates = [
		join(UI_LIB_DIR, `${libName}.ts`),
		join(UI_LIB_DIR, `${libName}.tsx`),
	];

	for (const candidate of candidates) {
		try {
			await access(candidate);
			const rawContent = await readFile(candidate, "utf-8");
			// Rewrite @workspace/ui/lib/* → @/lib/* within the lib file itself
			const content = rawContent.replace(
				/(['"])@workspace\/ui\/lib\/([^'"]+)\1/g,
				(_m, q, rest) => `${q}@/lib/${rest}${q}`,
			);
			const ext = candidate.endsWith(".tsx") ? ".tsx" : ".ts";
			return {
				path: `ui/lib/${libName}${ext}`,
				type: "registry:lib",
				content,
				target: `src/lib/${libName}${ext}`,
			};
		} catch {
			// File not found, try next
		}
	}
	return null;
}

/**
 * Loads a workspace/ui CSS file from packages/ui/src/styles/ and returns a
 * RegistryItemFile targeting src/styles/{name} in the consumer project.
 */
async function loadWorkspaceUiCssFile(
	cssName: string,
): Promise<RegistryItemFile | null> {
	const UI_STYLES_DIR = resolve(WORKSPACE_ROOT, "packages/ui/src/styles");
	const candidate = join(UI_STYLES_DIR, cssName);
	try {
		await access(candidate);
		const content = await readFile(candidate, "utf-8");
		return {
			path: `ui/styles/${cssName}`,
			type: "registry:file",
			content,
			target: `src/styles/${cssName}`,
		};
	} catch {
		return null;
	}
}

/**
 * Recursively resolves all custom workspace/ui component and hook files
 * needed, scanning each included file for further workspace/ui refs.
 *
 * Returns:
 *  - extraFiles: additional RegistryItemFile entries to embed
 *  - shadcnDeps: shadcn component names AND external registry URLs
 *    for registryDependencies
 */
async function resolveWorkspaceUiDeps(
	initialRefs: WorkspaceUiRefs,
): Promise<{ extraFiles: RegistryItemFile[]; shadcnDeps: Set<string> }> {
	const shadcnDeps = new Set<string>();
	const extraFiles: RegistryItemFile[] = [];
	const processedComponents = new Set<string>();
	const processedHooks = new Set<string>();
	const processedLibs = new Set<string>();
	const processedCssFiles = new Set<string>();
	const addedTargets = new Set<string>();

	const pendingComponents = new Set<string>(initialRefs.components);
	const pendingHooks = new Set<string>(initialRefs.hooks);
	const pendingLibs = new Set<string>(initialRefs.libs ?? []);
	const pendingCssFiles = new Set<string>(initialRefs.cssFiles ?? []);

	while (
		pendingComponents.size > 0 ||
		pendingHooks.size > 0 ||
		pendingLibs.size > 0 ||
		pendingCssFiles.size > 0
	) {
		// Process component refs
		for (const comp of Array.from(pendingComponents)) {
			pendingComponents.delete(comp);
			if (processedComponents.has(comp)) continue;
			processedComponents.add(comp);

			// Deep path (e.g. "auto-form/stepped-auto-form"):
			// - The top-level name (e.g. "auto-form") may be an external registry item.
			// - The specific file (e.g. "stepped-auto-form") may be a workspace-only
			//   extension that needs to be embedded directly.
			if (comp.includes("/")) {
				const topLevel = comp.split("/")[0]!;

				// Register the top-level component as a registry dep if applicable
				if (STANDARD_SHADCN_COMPONENTS.has(topLevel)) {
					shadcnDeps.add(topLevel);
				} else if (EXTERNAL_REGISTRY_COMPONENTS[topLevel]) {
					shadcnDeps.add(EXTERNAL_REGISTRY_COMPONENTS[topLevel]);
					console.log(
						`  ext   @workspace/ui/${topLevel} → external registry URL`,
					);
				}

				// Also try to embed the specific deep file from the workspace
				const file = await loadWorkspaceUiComponent(comp);
				if (file) {
					if (!addedTargets.has(file.target ?? "")) {
						extraFiles.push(file);
						addedTargets.add(file.target ?? "");
						const refs = collectWorkspaceUiRefs(file.content ?? "");
						for (const c of refs.components) {
							if (!processedComponents.has(c)) pendingComponents.add(c);
						}
						for (const h of refs.hooks) {
							if (!processedHooks.has(h)) pendingHooks.add(h);
						}
					}
				}
				continue;
			}

			// Standard shadcn component → registryDependency name
			if (STANDARD_SHADCN_COMPONENTS.has(comp)) {
				shadcnDeps.add(comp);
				continue;
			}

			// Multi-file component → external registry URL
			if (EXTERNAL_REGISTRY_COMPONENTS[comp]) {
				shadcnDeps.add(EXTERNAL_REGISTRY_COMPONENTS[comp]);
				console.log(`  ext   @workspace/ui/${comp} → external registry URL`);
				continue;
			}

			// Try to load as a single-file component from packages/ui/src/
			const file = await loadWorkspaceUiComponent(comp);
			if (file) {
				if (!addedTargets.has(file.target ?? "")) {
					extraFiles.push(file);
					addedTargets.add(file.target ?? "");
					// Scan rewritten content for workspace/ui refs.
					// Note: after rewriting, @workspace/ui/* is gone — instead look for
					// @/lib/ and @/hooks/ imports that need workspace-file embedding.
					const refs = collectWorkspaceUiRefs(file.content ?? "");
					for (const c of refs.components) {
						if (!processedComponents.has(c)) pendingComponents.add(c);
					}
					for (const h of refs.hooks) {
						if (!processedHooks.has(h)) pendingHooks.add(h);
					}
					for (const l of collectLibRefsFromRewritten(file.content ?? "")) {
						if (!processedLibs.has(l)) pendingLibs.add(l);
					}
					for (const h of collectHookRefsFromRewritten(file.content ?? "")) {
						if (!processedHooks.has(h)) pendingHooks.add(h);
					}
				}
			} else {
				console.warn(
					`  ⚠  @workspace/ui component "${comp}" not found locally or in external registry map — imports may be unresolved`,
				);
			}
		}

		// Process hook refs
		for (const hook of Array.from(pendingHooks)) {
			pendingHooks.delete(hook);
			if (processedHooks.has(hook)) continue;
			processedHooks.add(hook);

			const file = await loadWorkspaceUiHook(hook);
			if (file) {
				if (!addedTargets.has(file.target ?? "")) {
					extraFiles.push(file);
					addedTargets.add(file.target ?? "");
					const refs = collectWorkspaceUiRefs(file.content ?? "");
					for (const c of refs.components) {
						if (!processedComponents.has(c)) pendingComponents.add(c);
					}
					for (const h of refs.hooks) {
						if (!processedHooks.has(h)) pendingHooks.add(h);
					}
					for (const l of collectLibRefsFromRewritten(file.content ?? "")) {
						if (!processedLibs.has(l)) pendingLibs.add(l);
					}
					for (const h of collectHookRefsFromRewritten(file.content ?? "")) {
						if (!processedHooks.has(h)) pendingHooks.add(h);
					}
					console.log(
						`  add   src/hooks/${hook}.ts (registry:hook) [from @workspace/ui/hooks]`,
					);
				}
			} else {
				console.warn(
					`  ⚠  @workspace/ui hook "${hook}" not found locally — imports may be unresolved`,
				);
			}
		}

		// Process lib refs (e.g. compose-refs, needed by kanban.tsx)
		for (const lib of Array.from(pendingLibs)) {
			pendingLibs.delete(lib);
			if (processedLibs.has(lib)) continue;
			processedLibs.add(lib);

			const file = await loadWorkspaceUiLib(lib);
			if (file) {
				if (!addedTargets.has(file.target ?? "")) {
					extraFiles.push(file);
					addedTargets.add(file.target ?? "");
					console.log(
						`  add   src/lib/${lib}.ts (registry:lib) [from @workspace/ui/lib]`,
					);
					// Scan for further @/lib/ refs in the lib file itself
					for (const l of collectLibRefsFromRewritten(file.content ?? "")) {
						if (!processedLibs.has(l)) pendingLibs.add(l);
					}
				}
			} else {
				console.warn(
					`  ⚠  @workspace/ui lib "${lib}" not found — imports may be unresolved`,
				);
			}
		}

		// Process CSS file refs (e.g. @workspace/ui/markdown-content.css)
		for (const css of Array.from(pendingCssFiles)) {
			pendingCssFiles.delete(css);
			if (processedCssFiles.has(css)) continue;
			processedCssFiles.add(css);

			const file = await loadWorkspaceUiCssFile(css);
			if (file) {
				if (!addedTargets.has(file.target ?? "")) {
					extraFiles.push(file);
					addedTargets.add(file.target ?? "");
					console.log(
						`  add   src/styles/${css} (registry:file) [from @workspace/ui]`,
					);
				}
			} else {
				console.warn(
					`  ⚠  @workspace/ui CSS "${css}" not found in packages/ui/src/styles/ — import may be unresolved`,
				);
			}
		}
	}

	return { extraFiles, shadcnDeps };
}

// ---------------------------------------------------------------------------
// Plugin builder
// ---------------------------------------------------------------------------

async function buildPlugin(config: PluginConfig): Promise<RegistryItem> {
	const pluginName = config.name;
	const pluginDir = resolve(STACK_PLUGINS_DIR, pluginName);
	const clientDir = resolve(pluginDir, "client");

	console.log(`\nBuilding plugin: ${pluginName}`);

	const registryFiles: RegistryItemFile[] = [];
	const allWorkspaceUiRefs: WorkspaceUiRefs = {
		// Seed with any workspace UI components that must be embedded regardless of
		// whether plugin source files directly import them (e.g. date-picker is
		// needed by auto-form's date field but isn't imported by our CMS/form-builder
		// source — so we force it in here).
		components: new Set(config.extraWorkspaceUiComponents ?? []),
		hooks: new Set(),
		libs: new Set(),
		cssFiles: new Set(),
	};

	// ---- Embed plugin root files (types.ts, schemas.ts, utils.ts) ----------
	// These files live one level above client/ in the plugin directory.
	// Client components reference them with relative imports like "../../../types"
	// which resolve to the same relative depth in the consumer project, so NO
	// import rewriting is needed — just embed them at the correct target path.
	if (config.pluginRootFiles.length > 0) {
		const { files: rootFiles, uiRefs: rootUiRefs } = await embedPluginRootFiles(
			pluginName,
			pluginDir,
			config.pluginRootFiles,
		);

		for (const f of rootFiles) {
			registryFiles.push(f);
		}
		for (const c of rootUiRefs.components) allWorkspaceUiRefs.components.add(c);
		for (const h of rootUiRefs.hooks) allWorkspaceUiRefs.hooks.add(h);
		for (const l of rootUiRefs.libs) allWorkspaceUiRefs.libs.add(l);
		for (const css of rootUiRefs.cssFiles) allWorkspaceUiRefs.cssFiles.add(css);
	}

	// ---- Glob all files in the client directory ----------------------------
	const relPaths: string[] = [];
	for await (const f of glob("**/*", { cwd: clientDir })) {
		// Node's glob returns paths with OS separator; normalise
		const normalised = f.replace(/\\/g, "/");
		relPaths.push(normalised);
	}

	// Sort for deterministic output
	relPaths.sort();

	for (const relPath of relPaths) {
		// Skip directories (glob returns both files and dirs)
		const absPathCheck = resolve(clientDir, relPath);
		const stats = await stat(absPathCheck);
		if (!stats.isFile()) continue;

		if (shouldExclude(relPath)) {
			console.log(`  skip  ${relPath}`);
			continue;
		}

		const absPath = resolve(clientDir, relPath);
		let content = await readFile(absPath, "utf-8");

		// Collect workspace/ui refs BEFORE rewriting (using original import paths)
		const refs = collectWorkspaceUiRefs(content);
		for (const c of refs.components) allWorkspaceUiRefs.components.add(c);
		for (const h of refs.hooks) allWorkspaceUiRefs.hooks.add(h);
		for (const l of refs.libs) allWorkspaceUiRefs.libs.add(l);
		for (const css of refs.cssFiles) allWorkspaceUiRefs.cssFiles.add(css);

		// Apply import rewrites
		content = rewriteWorkspaceUiImports(content);
		content = rewriteHookImports(content, absPath, clientDir, pluginName);
		// Rewrite server-side api/ and query-keys imports to npm package paths
		content = rewriteApiAndQueryKeyImports(
			content,
			absPath,
			pluginDir,
			pluginName,
		);

		const fileType = classifyClientFile(relPath);

		// Target preserves the full directory structure so all relative imports
		// remain valid in the consumer project.
		const target = `src/components/btst/${pluginName}/client/${relPath}`;

		registryFiles.push({
			path: `btst/${pluginName}/client/${relPath}`,
			type: fileType,
			content,
			target,
		});

		console.log(`  add   ${relPath} (${fileType})`);
	}

	// ---- Resolve workspace/ui dependency files -----------------------------
	console.log(`\n  Resolving @workspace/ui dependencies…`);
	const { extraFiles, shadcnDeps } =
		await resolveWorkspaceUiDeps(allWorkspaceUiRefs);

	for (const f of extraFiles) {
		registryFiles.push(f);
		console.log(`  add   ${f.target} (${f.type}) [from @workspace/ui]`);
	}

	// ---- Assemble the registry item ----------------------------------------
	const item: RegistryItem = {
		name: `btst-${pluginName}`,
		type: "registry:block",
		title: config.title,
		description: config.description,
		author: "BTST <https://better-stack.ai>",
		dependencies: ["@btst/stack", ...config.extraNpmDeps],
		...(config.extraNpmDevDeps?.length
			? { devDependencies: config.extraNpmDevDeps }
			: {}),
		registryDependencies: [
			...Array.from(shadcnDeps).sort(),
			...config.extraRegistryDeps,
		],
		files: registryFiles,
		docs: `https://better-stack.ai/docs/plugins/${pluginName}`,
	};

	// Validate
	const result = registryItemSchema.safeParse(item);
	if (!result.success) {
		console.error(`\n❌ Schema validation failed for plugin "${pluginName}":`);
		console.error(JSON.stringify(result.error.format(), null, 2));
		process.exit(1);
	}

	console.log(
		`  ✓ ${pluginName}: ${registryFiles.length} files, ${shadcnDeps.size} shadcn deps`,
	);
	return item;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	console.log("Building BTST shadcn registry…\n");

	await mkdir(OUTPUT_DIR, { recursive: true });

	const items: RegistryItem[] = [];

	for (const config of PLUGINS) {
		const item = await buildPlugin(config);
		items.push(item);

		// Write individual plugin file
		const pluginFilePath = join(OUTPUT_DIR, `btst-${config.name}.json`);
		await writeFile(pluginFilePath, JSON.stringify(item, null, 2) + "\n");
		console.log(`  → wrote ${relative(WORKSPACE_ROOT, pluginFilePath)}`);
	}

	// Build collection registry.json
	// The collection contains only metadata (no embedded files) so that
	// npx shadcn add <collection-url> presents a picker of available items.
	const collection: Registry = {
		$schema: "https://ui.shadcn.com/schema/registry.json",
		name: "btst",
		homepage: "https://better-stack.ai",
		items: items.map(({ files: _files, ...metadata }) => metadata),
	};

	const collectionResult = registrySchema.safeParse(collection);
	if (!collectionResult.success) {
		console.error("\n❌ Registry collection schema validation failed:");
		console.error(JSON.stringify(collectionResult.error.format(), null, 2));
		process.exit(1);
	}

	const collectionFilePath = join(OUTPUT_DIR, "registry.json");
	await writeFile(
		collectionFilePath,
		JSON.stringify(collection, null, 2) + "\n",
	);
	console.log(`\n  → wrote ${relative(WORKSPACE_ROOT, collectionFilePath)}`);

	console.log(`\n✅ Registry built successfully! (${items.length} plugins)\n`);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
