"use server";

import { buildScaffoldPlan, PLUGINS, PLUGIN_ROUTES } from "@btst/codegen/lib";
import type { PluginKey, FileWritePlanItem } from "@btst/codegen/lib";
import { getEffectivePlugins } from "@/lib/plugin-selection";

export interface GenerateResult {
	files: FileWritePlanItem[];
	routes: string[];
	cssImports: string[];
	extraPackages: string[];
}

export async function generateProject(
	plugins: PluginKey[],
): Promise<GenerateResult> {
	const withRouteDocs = getEffectivePlugins(plugins);

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
	const extraPackages = Array.from(
		new Set(
			PLUGINS.filter((p) => withRouteDocs.includes(p.key as PluginKey)).flatMap(
				(p) => p.extraPackages ?? [],
			),
		),
	);

	return {
		files: plan.files,
		routes,
		cssImports,
		extraPackages,
	};
}
