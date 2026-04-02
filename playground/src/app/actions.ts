"use server";

import { buildScaffoldPlan, PLUGINS, PLUGIN_ROUTES } from "@btst/codegen/lib";
import type {
	PluginKey,
	FileWritePlanItem,
	Framework,
} from "@btst/codegen/lib";
import { getEffectivePlugins } from "@/lib/plugin-selection";
import {
	buildSeedRouteFiles,
	buildSeedRunnerScript,
	seedApiPath,
	type SeedRouteFile,
} from "@/lib/seed-templates";

export interface GenerateResult {
	files: FileWritePlanItem[];
	routes: string[];
	cssImports: string[];
	extraPackages: string[];
	hasAiChat: boolean;
	seedRouteFiles: SeedRouteFile[];
	seedRunnerScript: string | null;
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

	const cssImports = PLUGINS.filter((p) =>
		withRouteDocs.includes(p.key as PluginKey),
	)
		.map((p) => p.cssImport)
		.filter((c): c is string => Boolean(c));

	const routes = withRouteDocs.flatMap((p) => PLUGIN_ROUTES[p] ?? []);
	const extraPackages = Array.from(
		new Set(
			PLUGINS.filter((p) => withRouteDocs.includes(p.key as PluginKey)).flatMap(
				(p) => p.extraPackages ?? [],
			),
		),
	);

	// Only seed plugins that are actually selected (after effective plugin resolution)
	const effectiveSeeded = seededPlugins.filter((k) =>
		withRouteDocs.includes(k),
	);

	const seedRouteFiles =
		effectiveSeeded.length > 0
			? buildSeedRouteFiles(effectiveSeeded, framework)
			: [];

	const seedRunnerScript =
		seedRouteFiles.length > 0
			? buildSeedRunnerScript(effectiveSeeded, port)
			: null;

	const seedRoutes = seedRouteFiles.map((f) =>
		seedApiPath(
			effectiveSeeded.find((k) => f.path.includes(k)) ?? effectiveSeeded[0]!,
		),
	);

	return {
		files: plan.files,
		routes,
		cssImports,
		extraPackages,
		hasAiChat: withRouteDocs.includes("ai-chat" as PluginKey),
		seedRouteFiles,
		seedRunnerScript,
		seedRoutes,
	};
}
