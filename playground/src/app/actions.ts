"use server";

import { getEffectivePlugins } from "@/lib/plugin-selection";
import type {
	PluginKey,
	FileWritePlanItem,
	Framework,
	SeedRouteFile,
} from "@btst/codegen/lib";
import {
	buildNextjsInstrumentationFile,
	buildSeedRouteFiles,
	seedApiPath,
	buildScaffoldPlan,
	PLUGIN_ROUTES,
} from "@btst/codegen/lib";

export interface GenerateResult {
	files: FileWritePlanItem[];
	routes: string[];
	cssImports: string[];
	extraPackages: string[];
	hasAiChat: boolean;
	seedRouteFiles: SeedRouteFile[];
	seedRunnerScript: string | null;
	seedPluginCode: string | null;
	seedRoutes: string[];
}

const FRAMEWORK_CONFIG: Record<
	Framework,
	{ alias: string; cssFile: string; port: number }
> = {
	nextjs: { alias: "@/", cssFile: "app/globals.css", port: 3000 },
	"react-router": { alias: "~/", cssFile: "app/app.css", port: 5173 },
	tanstack: { alias: "@/", cssFile: "src/styles/globals.css", port: 3000 },
};

export async function generateProject(
	plugins: PluginKey[],
	framework: Framework = "nextjs",
	seededPlugins: PluginKey[] = [],
): Promise<GenerateResult> {
	const withRouteDocs = getEffectivePlugins(plugins);
	const { alias, cssFile, port } = FRAMEWORK_CONFIG[framework];

	const plan = await buildScaffoldPlan({
		framework,
		adapter: "memory",
		plugins: withRouteDocs,
		alias: alias as "@/" | "~/" | "./",
		cssFile,
	});

	const routes = withRouteDocs.flatMap((p) => PLUGIN_ROUTES[p] ?? []);

	// Only seed plugins that are actually selected (after effective plugin resolution)
	const effectiveSeeded = seededPlugins.filter((k) =>
		withRouteDocs.includes(k),
	);

	// Per-framework seed strategy:
	//  • Next.js        → instrumentation.ts (awaited before first request)
	//  • React Router   → seed API routes + Vite configureServer plugin that calls
	//                     them via HTTP. ssrLoadModule with the ~/ alias is broken
	//                     in Vite 7 + React Router WebContainers environment.
	//  • TanStack Start → seed API routes + Vite configureServer plugin that calls
	//                     them via HTTP. ssrLoadModule breaks in Vite 7 + Nitro, and
	//                     Nitro server plugins run in an isolated context. HTTP calls
	//                     to the seed routes go through the request pipeline, which
	//                     IS the same module context as other API routes.
	let seedRouteFiles: SeedRouteFile[] = [];
	let seedRunnerScript: string | null = null;
	let seedPluginCode: string | null = null;

	if (effectiveSeeded.length > 0) {
		if (framework === "nextjs") {
			const instrContent = buildNextjsInstrumentationFile(effectiveSeeded);
			if (instrContent) {
				seedRouteFiles = [
					{ path: "instrumentation.ts", content: instrContent },
				];
			}
		} else if (framework === "tanstack") {
			// Generate seed API routes so they run inside Nitro's request pipeline.
			// Then add a Vite configureServer plugin that calls them via HTTP after
			// the server starts. This avoids ssrLoadModule (broken in Vite 7 + Nitro)
			// and avoids background processes (`&` is unreliable in WebContainers).
			seedRouteFiles = buildSeedRouteFiles(effectiveSeeded, framework);
			if (seedRouteFiles.length > 0) {
				const seedPaths = seedRouteFiles
					.map((f) => {
						const m = f.path.match(/seed-([^/]+)\.ts$/);
						return m ? `"/api/seed-${m[1]}"` : null;
					})
					.filter(Boolean)
					.join(", ");
				seedPluginCode = `{
  name: "btst-seed",
  configureServer(server) {
    const SEEDS = [${seedPaths}]
    const BASE = "http://localhost:${port}"
    async function trySeed(path) {
      for (let i = 0; i < 60; i++) {
        try {
          const res = await fetch(BASE + path)
          if (res.ok) { const d = await res.json(); console.log("[seed]", path, d); return }
        } catch {}
        await new Promise(r => setTimeout(r, 1000))
      }
      console.error("[seed] timed out:", path)
    }
    ;(async () => {
      await new Promise(resolve => {
        if (server.httpServer?.listening) resolve(undefined)
        else server.httpServer?.once("listening", () => resolve(undefined))
      })
      try {
        for (const path of SEEDS) { await trySeed(path) }
        console.log("[seed] Seeding complete")
      } catch (err) { console.error("[seed] Seeding failed:", err) }
    })()
  },
}`;
			}
		} else if (framework === "react-router") {
			// Same HTTP-based approach as TanStack: generate seed API routes and
			// call them via HTTP once the server starts. ssrLoadModule with the ~/
			// alias is broken in Vite 7 + React Router WebContainers environment.
			seedRouteFiles = buildSeedRouteFiles(effectiveSeeded, framework);
			if (seedRouteFiles.length > 0) {
				const seedPaths = seedRouteFiles
					.map((f) => {
						const m = f.path.match(/api\.seed-([^.]+)\.ts$/);
						return m ? `"/api/seed-${m[1]}"` : null;
					})
					.filter(Boolean)
					.join(", ");
				seedPluginCode = `{
  name: "btst-seed",
  configureServer(server) {
    const SEEDS = [${seedPaths}]
    const BASE = "http://localhost:${port}"
    async function trySeed(path) {
      for (let i = 0; i < 60; i++) {
        try {
          const res = await fetch(BASE + path)
          if (res.ok) { const d = await res.json(); console.log("[seed]", path, d); return }
        } catch {}
        await new Promise(r => setTimeout(r, 1000))
      }
      console.error("[seed] timed out:", path)
    }
    ;(async () => {
      await new Promise(resolve => {
        if (server.httpServer?.listening) resolve(undefined)
        else server.httpServer?.once("listening", () => resolve(undefined))
      })
      try {
        for (const path of SEEDS) { await trySeed(path) }
        console.log("[seed] Seeding complete")
      } catch (err) { console.error("[seed] Seeding failed:", err) }
    })()
  },
}`;
			}
		}
	}

	const seedRoutes = seedRouteFiles.map((f) =>
		seedApiPath(
			effectiveSeeded.find((k) => f.path.includes(k)) ?? effectiveSeeded[0]!,
		),
	);

	return {
		files: plan.files,
		routes,
		cssImports: plan.cssImports,
		extraPackages: plan.extraPackages,
		hasAiChat: withRouteDocs.includes("ai-chat" as PluginKey),
		seedRouteFiles,
		seedRunnerScript,
		seedPluginCode,
		seedRoutes,
	};
}
