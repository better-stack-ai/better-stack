"use server";

import { buildScaffoldPlan, PLUGINS, PLUGIN_ROUTES } from "@btst/codegen/lib";
import type { PluginKey, FileWritePlanItem } from "@btst/codegen/lib";

export interface GenerateResult {
	files: FileWritePlanItem[];
	routes: string[];
	cssImports: string[];
}

export async function generateProject(
	plugins: PluginKey[],
): Promise<GenerateResult> {
	// ui-builder requires cms
	const selectedPlugins: PluginKey[] =
		plugins.includes("ui-builder") && !plugins.includes("cms")
			? ["cms", ...plugins]
			: plugins;

	// Always include route-docs so users can see all available routes
	const withRouteDocs: PluginKey[] = selectedPlugins.includes("route-docs")
		? selectedPlugins
		: [...selectedPlugins, "route-docs"];

	const plan = await buildScaffoldPlan({
		framework: "nextjs",
		adapter: "memory",
		plugins: withRouteDocs,
		alias: "@/",
		cssFile: "app/globals.css",
	});

	const cssImports = PLUGINS.filter((p) =>
		withRouteDocs.includes(p.key as PluginKey),
	)
		.map((p) => p.cssImport)
		.filter((c): c is string => Boolean(c));

	const routes = withRouteDocs.flatMap((p) => PLUGIN_ROUTES[p] ?? []);

	return {
		files: plan.files,
		routes,
		cssImports,
	};
}
