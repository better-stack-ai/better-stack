"use client";

import type { PluginMeta } from "@btst/codegen/meta";
import type { PluginKey } from "@btst/codegen/meta";

interface PluginSelectorProps {
	plugins: readonly PluginMeta[];
	selected: PluginKey[];
	onChange: (plugins: PluginKey[]) => void;
	seededPlugins: PluginKey[];
	onSeedChange: (seeded: PluginKey[]) => void;
	disabled?: boolean;
}

const PLUGIN_DESCRIPTIONS: Record<string, string> = {
	blog: "Full-featured blog with posts, drafts, and tags",
	"ai-chat": "AI chat interface with conversation history",
	cms: "Content management system with custom content types",
	"form-builder": "Drag-and-drop form builder with submissions",
	"ui-builder": "Visual page builder (requires CMS)",
	kanban: "Kanban board with drag-and-drop columns and cards",
	comments: "Nested comments with moderation dashboard",
	media: "Media library with file upload and management",
	"route-docs": "Auto-generated route documentation page",
	"open-api": "OpenAPI spec endpoint at /api/data/reference",
	"better-auth-ui": "Authentication UI (sign in, account, org)",
};

export function PluginSelector({
	plugins,
	selected,
	onChange,
	seededPlugins,
	onSeedChange,
	disabled,
}: PluginSelectorProps) {
	function toggle(key: PluginKey) {
		if (selected.includes(key)) {
			onChange(selected.filter((k) => k !== key));
		} else {
			onChange([...selected, key]);
		}
	}

	function toggleSeed(key: PluginKey) {
		if (seededPlugins.includes(key)) {
			onSeedChange(seededPlugins.filter((k) => k !== key));
		} else {
			onSeedChange([...seededPlugins, key]);
		}
	}

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
			{plugins.map((plugin) => {
				const isRouteDocs = plugin.key === "route-docs";
				const isSelected =
					isRouteDocs || selected.includes(plugin.key as PluginKey);
				const isSeedable =
					Boolean(plugin.hasSeedData) && isSelected && !isRouteDocs;
				const isSeeded =
					isSeedable && seededPlugins.includes(plugin.key as PluginKey);
				return (
					<button
						key={plugin.key}
						type="button"
						onClick={() => !isRouteDocs && toggle(plugin.key as PluginKey)}
						disabled={disabled || isRouteDocs}
						className={[
							"flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
							isSelected
								? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-400"
								: "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600",
							disabled
								? "opacity-60 cursor-not-allowed"
								: isRouteDocs
									? "cursor-default"
									: "cursor-pointer",
						]
							.filter(Boolean)
							.join(" ")}
						aria-pressed={isSelected}
					>
						<span
							className={[
								"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
								isSelected
									? "border-blue-500 bg-blue-500 dark:border-blue-400 dark:bg-blue-400"
									: "border-zinc-300 dark:border-zinc-600",
							].join(" ")}
						>
							{isSelected && (
								<svg
									className="h-2.5 w-2.5 text-white"
									viewBox="0 0 10 10"
									fill="currentColor"
								>
									<path
										d="M8.5 2L4 7.5 1.5 5"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
										fill="none"
									/>
								</svg>
							)}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block font-medium text-sm text-zinc-900 dark:text-zinc-100">
								{plugin.label}
								{isRouteDocs && (
									<span className="ml-1.5 text-xs text-zinc-400">
										(always included)
									</span>
								)}
							</span>
							{PLUGIN_DESCRIPTIONS[plugin.key] && (
								<span className="block text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
									{PLUGIN_DESCRIPTIONS[plugin.key]}
								</span>
							)}
							{isSeedable && (
								<span
									role="checkbox"
									aria-checked={isSeeded}
									aria-label={`Seed sample data for ${plugin.label}`}
									tabIndex={disabled ? -1 : 0}
									onClick={(e) => {
										e.stopPropagation();
										if (!disabled) toggleSeed(plugin.key as PluginKey);
									}}
									onKeyDown={(e) => {
										if (e.key === " " || e.key === "Enter") {
											e.preventDefault();
											e.stopPropagation();
											if (!disabled) toggleSeed(plugin.key as PluginKey);
										}
									}}
									className={[
										"mt-1.5 inline-flex items-center gap-1.5 text-xs rounded cursor-pointer select-none",
										disabled ? "pointer-events-none opacity-60" : "",
									].join(" ")}
								>
									<span
										className={[
											"flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border transition-colors",
											isSeeded
												? "border-emerald-500 bg-emerald-500 dark:border-emerald-400 dark:bg-emerald-400"
												: "border-zinc-300 bg-white dark:border-zinc-500 dark:bg-zinc-800",
										].join(" ")}
									>
										{isSeeded && (
											<svg
												className="h-2 w-2 text-white"
												viewBox="0 0 10 10"
												fill="currentColor"
											>
												<path
													d="M8.5 2L4 7.5 1.5 5"
													stroke="currentColor"
													strokeWidth="1.5"
													strokeLinecap="round"
													strokeLinejoin="round"
													fill="none"
												/>
											</svg>
										)}
									</span>
									<span
										className={
											isSeeded
												? "text-emerald-600 dark:text-emerald-400"
												: "text-zinc-400 dark:text-zinc-500"
										}
									>
										Seed sample data
									</span>
								</span>
							)}
						</span>
					</button>
				);
			})}
		</div>
	);
}
