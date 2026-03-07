#!/usr/bin/env node
/**
 * Copies @btst/stack/src outside of node_modules so Tailwind's WASM scanner
 * (used in WebContainers/StackBlitz) can traverse it.
 *
 * The WASM oxide scanner cannot scan inside node_modules due to a bug:
 * https://github.com/tailwindlabs/tailwindcss/issues/18418
 *
 * Run automatically via the predev/prebuild npm lifecycle hooks.
 */
import { cp, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";

const src = "node_modules/@btst/stack/src";
const dest = "app/.btst-stack-src";

const uiSrc = "node_modules/@btst/stack/dist/packages/ui";
const uiDest = "app/.btst-stack-ui";

if (!existsSync(src)) {
	console.log(
		"[copy-stack-src] node_modules/@btst/stack/src not found, skipping",
	);
	process.exit(0);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`[copy-stack-src] copied ${src} → ${dest}`);

if (existsSync(uiSrc)) {
	await rm(uiDest, { recursive: true, force: true });
	await mkdir(uiDest, { recursive: true });
	await cp(uiSrc, uiDest, { recursive: true });
	console.log(`[copy-stack-src] copied ${uiSrc} → ${uiDest}`);
} else {
	console.log(`[copy-stack-src] ${uiSrc} not found, skipping`);
}

// When running inside the monorepo, the workspace-built dist/plugins/ has
// @workspace/ui imports already inlined by postbuild.cjs. Copy those files
// over the npm-installed ones so the demo uses the correct, self-contained CSS.
// Outside the monorepo (StackBlitz/WebContainers), this path won't exist and
// the step is silently skipped — the published npm package handles it instead.
const workspacePluginsDist = "../../packages/stack/dist/plugins";
const npmPluginsDist = "node_modules/@btst/stack/dist/plugins";
if (existsSync(workspacePluginsDist)) {
	await cp(workspacePluginsDist, npmPluginsDist, { recursive: true });
	console.log(
		`[copy-stack-src] overlaid ${workspacePluginsDist} → ${npmPluginsDist}`,
	);
}
