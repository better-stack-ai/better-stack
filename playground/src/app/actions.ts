"use server";

import { buildScaffoldPlan, PLUGINS, PLUGIN_ROUTES } from "@btst/codegen/lib";
import type {
	PluginKey,
	FileWritePlanItem,
	Framework,
} from "@btst/codegen/lib";
import { getEffectivePlugins } from "@/lib/plugin-selection";

export interface GenerateResult {
	files: FileWritePlanItem[];
	routes: string[];
	cssImports: string[];
	extraPackages: string[];
	hasAiChat: boolean;
}

const FRAMEWORK_CONFIG: Record<Framework, { alias: string; cssFile: string }> =
	{
		nextjs: { alias: "@/", cssFile: "app/globals.css" },
		"react-router": { alias: "~/", cssFile: "app/app.css" },
		tanstack: { alias: "@/", cssFile: "src/styles/globals.css" },
	};

export async function generateProject(
	plugins: PluginKey[],
	framework: Framework = "nextjs",
): Promise<GenerateResult> {
	const withRouteDocs = getEffectivePlugins(plugins);
	const { alias, cssFile } = FRAMEWORK_CONFIG[framework];

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

	return {
		files: plan.files,
		routes,
		cssImports,
		extraPackages,
		hasAiChat: withRouteDocs.includes("ai-chat" as PluginKey),
	};
}
