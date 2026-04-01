"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import {
	useQueryState,
	parseAsArrayOf,
	parseAsString,
	parseAsStringEnum,
} from "nuqs";
import type {
	PluginMeta,
	PluginKey,
	FileWritePlanItem,
	Framework,
} from "@btst/codegen/lib";
import { generateProject } from "@/app/actions";
import { getEffectivePlugins } from "@/lib/plugin-selection";
import { PluginSelector } from "./plugin-selector";
import { RouteDrawer } from "./route-drawer";
import { StackBlitzEmbed } from "./stackblitz-embed";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardAction,
	CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PlaygroundClientProps {
	plugins: readonly PluginMeta[];
	pluginRoutes: Record<PluginKey, string[]>;
}

type View = "configure" | "preview";

interface GeneratedState {
	files: FileWritePlanItem[];
	routes: string[];
	cssImports: string[];
	extraPackages: string[];
	hasAiChat: boolean;
}

const FRAMEWORKS: { key: Framework; label: string; devServer: string }[] = [
	{ key: "nextjs", label: "Next.js", devServer: "next dev" },
	{ key: "react-router", label: "React Router", devServer: "react-router dev" },
	{ key: "tanstack", label: "TanStack Start", devServer: "vite dev" },
];

export function PlaygroundClient({
	plugins,
	pluginRoutes,
}: PlaygroundClientProps) {
	const [selectedRaw, setSelectedRaw] = useQueryState(
		"plugins",
		parseAsArrayOf(parseAsString).withDefault(["blog"]),
	);
	const selected = selectedRaw as PluginKey[];
	const setSelected = (keys: PluginKey[]) => setSelectedRaw(keys);

	const [framework, setFramework] = useQueryState(
		"framework",
		parseAsStringEnum<Framework>([
			"nextjs",
			"react-router",
			"tanstack",
		]).withDefault("nextjs"),
	);

	const [view, setView] = useQueryState(
		"view",
		parseAsStringEnum<View>(["configure", "preview"]).withDefault("configure"),
	);
	const [generated, setGenerated] = useState<GeneratedState | null>(null);
	const [activePreviewRoute, setActivePreviewRoute] = useState<string | null>(
		null,
	);
	const [isPending, startTransition] = useTransition();
	const selectedCount = getEffectivePlugins(selected).length;

	const activeFramework =
		FRAMEWORKS.find((f) => f.key === framework) ?? FRAMEWORKS[0]!;

	const handleLaunch = useCallback(() => {
		startTransition(async () => {
			const result = await generateProject(selected, framework);
			setGenerated(result);
			const firstPageRoute = result.routes.find((route) =>
				route.startsWith("/pages/"),
			);
			setActivePreviewRoute(firstPageRoute ?? null);
			setView("preview");
		});
	}, [selected, framework]);

	const handleBack = useCallback(() => {
		setView("configure");
		setActivePreviewRoute(null);
	}, []);

	// On refresh/share: if view=preview but no generated data yet, re-run generation
	useEffect(() => {
		if (view === "preview" && !generated && !isPending) {
			startTransition(async () => {
				const result = await generateProject(selected, framework);
				setGenerated(result);
				const firstPageRoute = result.routes.find((route) =>
					route.startsWith("/pages/"),
				);
				setActivePreviewRoute((prev) => prev ?? firstPageRoute ?? null);
			});
		}
		// Only run on mount — selected/framework come from the URL and are stable at this point
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Preview routes are either from the generated state or derived from selection
	const previewRoutes = generated?.routes ?? [];
	const handlePreviewRouteClick = useCallback((route: string) => {
		if (!route.startsWith("/pages/")) return;
		setActivePreviewRoute(route);
	}, []);

	return (
		<div className="flex flex-col gap-6">
			{view === "configure" ? (
				<>
					{/* Hero */}
					<div className="text-center pt-4 pb-2">
						<h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">
							Build a BTST project
							<span className="text-primary"> in your browser</span>
						</h1>
						<p className="text-muted-foreground max-w-xl mx-auto text-base">
							Select the plugins you want, then launch a live preview powered by
							StackBlitz WebContainers — no install required.
						</p>
					</div>

					{/* Framework selector */}
					<div className="max-w-3xl mx-auto w-full">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-muted-foreground shrink-0">
								Framework
							</span>
							<div className="flex gap-1 p-1 bg-muted rounded-lg">
								{FRAMEWORKS.map((fw) => (
									<button
										key={fw.key}
										type="button"
										onClick={() => setFramework(fw.key)}
										className={cn(
											"px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
											framework === fw.key
												? "bg-background text-foreground shadow-xs"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										{fw.label}
									</button>
								))}
							</div>
						</div>
					</div>

					{/* Plugin selector */}
					<div className="max-w-3xl mx-auto w-full">
						<Card>
							<CardHeader>
								<CardTitle>Select plugins</CardTitle>
								<CardDescription>
									{selectedCount} selected · route-docs always included
								</CardDescription>
								<CardAction>
									<div className="flex items-center gap-1">
										<Button
											variant="ghost"
											size="xs"
											onClick={() => setSelected([])}
										>
											Clear all
										</Button>
										<span className="text-border">|</span>
										<Button
											variant="ghost"
											size="xs"
											onClick={() =>
												setSelected(
													plugins
														.filter((p) => p.key !== "route-docs")
														.map((p) => p.key as PluginKey),
												)
											}
										>
											Select all
										</Button>
									</div>
								</CardAction>
							</CardHeader>
							<CardContent>
								<PluginSelector
									plugins={plugins}
									selected={selected}
									onChange={setSelected}
								/>
							</CardContent>
						</Card>
					</div>

					{/* Action row: routes drawer + launch button + CLI hint */}
					<div className="max-w-3xl mx-auto w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
						<RouteDrawer
							routes={getRoutesForSelection(selected, pluginRoutes)}
						/>

						<Button
							onClick={handleLaunch}
							disabled={isPending}
							className="flex-1"
							size="lg"
						>
							{isPending ? (
								<>
									<svg
										data-icon="inline-start"
										className="animate-spin"
										viewBox="0 0 24 24"
										fill="none"
									>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
										/>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
										/>
									</svg>
									Generating project…
								</>
							) : (
								<>
									<svg
										data-icon="inline-start"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
									>
										<polygon points="5,3 19,12 5,21" />
									</svg>
									Open in Editor
								</>
							)}
						</Button>

						{/* CLI hint */}
						<Card
							size="sm"
							className="shrink-0 flex-row items-center gap-2 py-3 px-4"
						>
							<span className="text-xs font-medium text-muted-foreground whitespace-nowrap hidden sm:inline">
								CLI:
							</span>
							<code className="text-xs bg-muted rounded-lg px-2 py-1 font-mono text-foreground whitespace-nowrap">
								{framework === "nextjs"
									? "npx @btst/codegen@latest init"
									: `npx @btst/codegen@latest init --framework ${framework}`}
							</code>
						</Card>
					</div>
				</>
			) : (
				<>
					{/* Preview header */}
					<div className="flex items-center justify-between">
						<div>
							<h2 className="font-semibold text-lg">
								Live preview
								<span className="ml-2 text-xs font-normal text-muted-foreground">
									{activeFramework.label}
								</span>
							</h2>
							<p className="text-xs text-muted-foreground mt-0.5">
								Running in StackBlitz WebContainer · {activeFramework.devServer}
							</p>
						</div>
						<div className="flex items-center gap-3">
							<Button variant="ghost" size="sm" onClick={handleBack}>
								<svg
									data-icon="inline-start"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path
										d="M19 12H5M12 5l-7 7 7 7"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
								Change plugins
							</Button>
						</div>
					</div>

					{/* Embed — full width now that the route sidebar is in a drawer */}
					<div style={{ minHeight: 680 }}>
						{generated && (
							<StackBlitzEmbed
								framework={framework}
								generatedFiles={generated.files}
								cssImports={generated.cssImports}
								extraPackages={generated.extraPackages}
								hasAiChat={generated.hasAiChat}
								previewPath={activePreviewRoute}
								extraButtons={
									<RouteDrawer
										routes={previewRoutes}
										onPageRouteClick={handlePreviewRouteClick}
										activePageRoute={activePreviewRoute}
										footer={(navigate) => (
											<>
												<p className="text-xs text-muted-foreground mb-1">
													Navigate inside the preview to:
												</p>
												<button
													type="button"
													onClick={() => navigate("/pages/route-docs")}
													className="text-xs font-mono text-primary hover:underline cursor-pointer"
												>
													/pages/route-docs
												</button>
												<p className="text-xs text-muted-foreground mt-1">
													to see all routes live.
												</p>
											</>
										)}
									/>
								}
							/>
						)}
					</div>
				</>
			)}
		</div>
	);
}

// Derive routes from the current plugin selection before generating
function getRoutesForSelection(
	selected: PluginKey[],
	pluginRoutes: Record<PluginKey, string[]>,
): string[] {
	return getEffectivePlugins(selected).flatMap(
		(pluginKey) => pluginRoutes[pluginKey] ?? [],
	);
}
