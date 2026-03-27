"use client";

import { useState, useTransition, useCallback } from "react";
import type {
	PluginMeta,
	PluginKey,
	FileWritePlanItem,
} from "@btst/codegen/lib";
import { generateProject } from "@/app/actions";
import { PluginSelector } from "./plugin-selector";
import { RouteList } from "./route-list";
import { StackBlitzEmbed } from "./stackblitz-embed";

interface PlaygroundClientProps {
	plugins: readonly PluginMeta[];
}

type View = "configure" | "preview";

interface GeneratedState {
	files: FileWritePlanItem[];
	routes: string[];
	cssImports: string[];
}

export function PlaygroundClient({ plugins }: PlaygroundClientProps) {
	const [selected, setSelected] = useState<PluginKey[]>(["blog"]);
	const [view, setView] = useState<View>("configure");
	const [generated, setGenerated] = useState<GeneratedState | null>(null);
	const [activePreviewRoute, setActivePreviewRoute] = useState<string | null>(
		null,
	);
	const [isPending, startTransition] = useTransition();

	const handleLaunch = useCallback(() => {
		startTransition(async () => {
			const result = await generateProject(selected);
			setGenerated(result);
			const firstPageRoute = result.routes.find((route) =>
				route.startsWith("/pages/"),
			);
			setActivePreviewRoute(firstPageRoute ?? null);
			setView("preview");
		});
	}, [selected]);

	const handleBack = useCallback(() => {
		setView("configure");
		setActivePreviewRoute(null);
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
							<span className="text-blue-500"> in your browser</span>
						</h1>
						<p className="text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto text-base">
							Select the plugins you want, then launch a live preview powered by
							StackBlitz WebContainers — no install required.
						</p>
					</div>

					{/* Two-column layout: selector + route preview */}
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
						{/* Plugin selector */}
						<div className="lg:col-span-2">
							<div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
								<div className="flex items-center justify-between mb-4">
									<div>
										<h2 className="font-semibold text-base">Select plugins</h2>
										<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
											{selected.length} selected · route-docs always included
										</p>
									</div>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => setSelected([])}
											className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
										>
											Clear all
										</button>
										<span className="text-zinc-300 dark:text-zinc-700">|</span>
										<button
											type="button"
											onClick={() =>
												setSelected(
													plugins
														.filter((p) => p.key !== "route-docs")
														.map((p) => p.key as PluginKey),
												)
											}
											className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
										>
											Select all
										</button>
									</div>
								</div>
								<PluginSelector
									plugins={plugins}
									selected={selected}
									onChange={setSelected}
								/>
							</div>
						</div>

						{/* Route preview sidebar */}
						<div className="flex flex-col gap-4">
							<div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 flex-1">
								<h2 className="font-semibold text-base mb-3">
									Available routes
								</h2>
								<RouteList routes={getRoutesForSelection(selected, plugins)} />
							</div>

							{/* Launch button */}
							<button
								type="button"
								onClick={handleLaunch}
								disabled={isPending}
								className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 transition-colors text-sm"
							>
								{isPending ? (
									<>
										<svg
											className="animate-spin h-4 w-4"
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
											className="h-4 w-4"
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
							</button>

							{/* CLI hint */}
							<div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
								<p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
									Or scaffold locally with the CLI:
								</p>
								<code className="block text-xs bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2 font-mono text-zinc-700 dark:text-zinc-300 break-all">
									npx @btst/codegen@latest init
								</code>
							</div>
						</div>
					</div>
				</>
			) : (
				<>
					{/* Preview header */}
					<div className="flex items-center justify-between">
						<div>
							<h2 className="font-semibold text-lg">Live preview</h2>
							<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
								Running in StackBlitz WebContainer · next dev
							</p>
						</div>
						<div className="flex items-center gap-3">
							<button
								type="button"
								onClick={handleBack}
								className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
							>
								<svg
									className="h-4 w-4"
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
							</button>
						</div>
					</div>

					{/* Embed + route list */}
					<div
						className="grid grid-cols-1 lg:grid-cols-4 gap-4"
						style={{ minHeight: 680 }}
					>
						{/* StackBlitz embed */}
						<div className="lg:col-span-3" style={{ minHeight: 680 }}>
							{generated && (
								<StackBlitzEmbed
									generatedFiles={generated.files}
									cssImports={generated.cssImports}
									previewPath={activePreviewRoute}
								/>
							)}
						</div>

						{/* Route list sidebar */}
						<div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 overflow-auto">
							<h3 className="font-semibold text-sm mb-3">Available routes</h3>
							<RouteList
								routes={previewRoutes}
								onPageRouteClick={handlePreviewRouteClick}
								activePageRoute={activePreviewRoute}
							/>
							<div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
								<p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
									Navigate inside the preview to:
								</p>
								<code className="text-xs font-mono text-blue-600 dark:text-blue-400">
									/pages/route-docs
								</code>
								<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
									to see all routes live.
								</p>
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

// Derive routes from the current plugin selection before generating
function getRoutesForSelection(
	selected: PluginKey[],
	plugins: readonly PluginMeta[],
): string[] {
	// Inline the route map here so it works client-side without the server action
	const ROUTES: Record<string, string[]> = {
		blog: [
			"/pages/blog",
			"/pages/blog/drafts",
			"/pages/blog/new",
			"/pages/blog/:slug/edit",
			"/pages/blog/tag/:tagSlug",
			"/pages/blog/:slug",
		],
		"ai-chat": ["/pages/chat", "/pages/chat/:id"],
		cms: [
			"/pages/cms",
			"/pages/cms/:typeSlug",
			"/pages/cms/:typeSlug/new",
			"/pages/cms/:typeSlug/:id",
		],
		"form-builder": [
			"/pages/forms",
			"/pages/forms/new",
			"/pages/forms/:id/edit",
			"/pages/forms/:id/submissions",
		],
		"ui-builder": [
			"/pages/ui-builder",
			"/pages/ui-builder/new",
			"/pages/ui-builder/:id/edit",
		],
		kanban: ["/pages/kanban", "/pages/kanban/new", "/pages/kanban/:boardId"],
		comments: ["/pages/comments/moderation", "/pages/comments"],
		media: ["/pages/media"],
		"route-docs": ["/pages/route-docs"],
		"open-api": ["/api/data/reference"],
		"better-auth-ui": ["/pages/auth", "/pages/account/settings", "/pages/org"],
	};

	const withRouteDocs = selected.includes("route-docs")
		? selected
		: [...selected, "route-docs" as PluginKey];
	return withRouteDocs.flatMap((p) => ROUTES[p] ?? []);
}
