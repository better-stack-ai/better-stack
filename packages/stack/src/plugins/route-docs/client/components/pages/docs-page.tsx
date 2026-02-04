"use client";

import React, { useState, useMemo } from "react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { Separator } from "@workspace/ui/components/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@workspace/ui/components/sheet";
import {
	ChevronRight,
	ExternalLink,
	FileText,
	Folder,
	FolderOpen,
	Globe,
	Link2,
	Menu,
	Navigation,
} from "lucide-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type {
	RouteDocsSchema,
	DocumentedPlugin,
	DocumentedRoute,
	RouteParameter,
	PluginSitemapEntry,
} from "../../../generator";
import { ROUTE_DOCS_QUERY_KEY, generateSchema } from "../../plugin";

/**
 * Escapes regex special characters in a string, except for placeholders
 * that will be replaced with actual regex patterns.
 */
function escapeRegexForRoutePath(path: string): string {
	// Use unique placeholders that won't appear in URLs
	const PARAM_PLACEHOLDER = "\x00PARAM\x00";
	const WILDCARD_PLACEHOLDER = "\x00WILDCARD\x00";

	// Replace dynamic segments with placeholders before escaping
	let result = path
		.replace(/:[^/]+/g, PARAM_PLACEHOLDER)
		.replace(/\*/g, WILDCARD_PLACEHOLDER);

	// Escape all regex metacharacters
	result = result.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

	// Replace placeholders with actual regex patterns
	result = result
		.replace(new RegExp(PARAM_PLACEHOLDER, "g"), "[^/]+")
		.replace(new RegExp(WILDCARD_PLACEHOLDER, "g"), ".*");

	return result;
}

/**
 * Render a route path with highlighted parameters
 */
function HighlightedPath({ path }: { path: string }) {
	const parts = path.split("/");
	return (
		<code className="font-mono text-xl break-all">
			{parts.map((part, i) => {
				const isParam = part.startsWith(":") || part.startsWith("*");
				return (
					<React.Fragment key={i}>
						{i > 0 && <span className="text-muted-foreground">/</span>}
						{isParam ? (
							<span className="text-primary font-semibold">{part}</span>
						) : (
							<span className="text-foreground">{part}</span>
						)}
					</React.Fragment>
				);
			})}
		</code>
	);
}

/**
 * Mobile-friendly parameter card (used on small screens instead of table)
 */
function ParameterCard({ param }: { param: RouteParameter }) {
	return (
		<div className="rounded-lg border p-4 space-y-2">
			<div className="flex items-center justify-between gap-2 flex-wrap">
				<code className="font-mono text-sm text-primary font-semibold">
					{param.name}
				</code>
				<div className="flex gap-2">
					<Badge variant="secondary" className="font-mono text-xs">
						{param.type}
					</Badge>
					<Badge
						variant={param.required ? "destructive" : "outline"}
						className="text-xs"
					>
						{param.required ? "required" : "optional"}
					</Badge>
				</div>
			</div>
			{param.description && (
				<p className="text-sm text-muted-foreground">{param.description}</p>
			)}
			{param.schema?.enum && (
				<p className="text-xs text-muted-foreground">
					Values: {param.schema.enum.join(" | ")}
				</p>
			)}
		</div>
	);
}

/**
 * Parameters section - responsive table on desktop, cards on mobile
 */
function ParametersSection({
	params,
	title,
}: {
	params: RouteParameter[];
	title: string;
}) {
	if (params.length === 0) return null;

	return (
		<div className="space-y-3">
			<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
				{title}
			</h3>

			{/* Desktop table */}
			<div className="hidden md:block rounded-lg border overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[150px]">Name</TableHead>
							<TableHead className="w-[120px]">Type</TableHead>
							<TableHead className="w-[100px]">Required</TableHead>
							<TableHead>Description</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{params.map((param) => (
							<TableRow key={param.name}>
								<TableCell>
									<code className="font-mono text-sm text-primary">
										{param.name}
									</code>
								</TableCell>
								<TableCell>
									<Badge variant="secondary" className="font-mono text-xs">
										{param.type}
									</Badge>
									{param.schema?.enum && (
										<span className="ml-2 text-xs text-muted-foreground">
											({param.schema.enum.join(" | ")})
										</span>
									)}
								</TableCell>
								<TableCell>
									<Badge
										variant={param.required ? "destructive" : "outline"}
										className="text-xs"
									>
										{param.required ? "required" : "optional"}
									</Badge>
								</TableCell>
								<TableCell className="text-muted-foreground">
									{param.description || "—"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			{/* Mobile cards */}
			<div className="md:hidden space-y-3">
				{params.map((param) => (
					<ParameterCard key={param.name} param={param} />
				))}
			</div>
		</div>
	);
}

/**
 * Navigation form for routes with path parameters
 */
function NavigationForm({
	route,
	siteBasePath,
}: {
	route: DocumentedRoute;
	siteBasePath: string;
}) {
	const [paramValues, setParamValues] = useState<Record<string, string>>({});

	const handleParamChange = (name: string, value: string) => {
		setParamValues((prev) => ({ ...prev, [name]: value }));
	};

	const buildUrl = () => {
		let url = route.path;
		for (const param of route.pathParams) {
			const value = paramValues[param.name] || `{${param.name}}`;
			// Handle different parameter patterns:
			// - *:name (named wildcard) - must check before :name
			// - * (anonymous wildcard, extracted as "_")
			// - :name (standard path param)
			if (param.name === "_") {
				url = url.replace("*", value);
			} else if (url.includes(`*:${param.name}`)) {
				url = url.replace(`*:${param.name}`, value);
			} else {
				url = url.replace(`:${param.name}`, value);
			}
		}
		return `${siteBasePath}${url}`;
	};

	const handleVisit = () => {
		const url = buildUrl();
		const hasUnfilledParams = route.pathParams.some(
			(p) => !paramValues[p.name],
		);
		if (hasUnfilledParams) {
			return;
		}
		window.open(url, "_blank");
	};

	const allParamsFilled = route.pathParams.every((p) => paramValues[p.name]);
	const previewUrl = buildUrl();

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base flex items-center gap-2">
					<Navigation className="h-4 w-4" />
					Navigate to Route
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{route.pathParams.length > 0 ? (
					<>
						<div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
							{route.pathParams.map((param) => (
								<div key={param.name} className="space-y-2">
									<Label htmlFor={`param-${param.name}`} className="font-mono">
										:{param.name}
									</Label>
									<Input
										id={`param-${param.name}`}
										placeholder={`Enter ${param.name}...`}
										value={paramValues[param.name] || ""}
										onChange={(e) =>
											handleParamChange(param.name, e.target.value)
										}
									/>
								</div>
							))}
						</div>
						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
							<code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md font-mono text-muted-foreground break-all">
								{previewUrl}
							</code>
							<Button
								onClick={handleVisit}
								disabled={!allParamsFilled}
								className="shrink-0"
							>
								<ExternalLink className="h-4 w-4 mr-2" />
								Visit
							</Button>
						</div>
					</>
				) : (
					<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
						<code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono break-all">
							{siteBasePath}
							{route.path}
						</code>
						<Button
							onClick={() =>
								window.open(`${siteBasePath}${route.path}`, "_blank")
							}
							className="shrink-0"
						>
							<ExternalLink className="h-4 w-4 mr-2" />
							Visit
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * Get sitemap entries that match a specific route
 */
function getMatchingSitemapEntries(
	route: DocumentedRoute,
	sitemapEntries: PluginSitemapEntry[],
): PluginSitemapEntry[] {
	const hasParams = route.pathParams.length > 0;

	if (!hasParams) {
		// Static route - exact matches
		return sitemapEntries.filter((e) => {
			try {
				const url = new URL(e.url);
				return url.pathname.endsWith(route.path);
			} catch {
				return false;
			}
		});
	} else {
		// Dynamic route - pattern matches
		const routePattern = escapeRegexForRoutePath(route.path);
		const regex = new RegExp(`${routePattern}$`);
		return sitemapEntries.filter((e) => {
			try {
				const url = new URL(e.url);
				return regex.test(url.pathname);
			} catch {
				return false;
			}
		});
	}
}

/**
 * Route sitemap entries section - displays sitemap entries for a specific route
 */
function RouteSitemapSection({
	route,
	sitemapEntries,
}: {
	route: DocumentedRoute;
	sitemapEntries: PluginSitemapEntry[];
}) {
	const matchingEntries = useMemo(
		() => getMatchingSitemapEntries(route, sitemapEntries),
		[route, sitemapEntries],
	);

	if (matchingEntries.length === 0) return null;

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base flex items-center gap-2">
					<Globe className="h-4 w-4" />
					Sitemap Entries
					<Badge variant="secondary" className="ml-1">
						{matchingEntries.length}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent>
				{/* Desktop table */}
				<div className="hidden md:block rounded-lg border overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>URL</TableHead>
								<TableHead className="w-[120px]">Last Modified</TableHead>
								<TableHead className="w-[80px]">Priority</TableHead>
								<TableHead className="w-[80px]">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{matchingEntries.map((entry, idx) => (
								<TableRow key={idx}>
									<TableCell>
										<a
											href={entry.url}
											target="_blank"
											rel="noopener noreferrer"
											className="hover:underline"
										>
											<code className="font-mono text-xs text-primary truncate block max-w-[400px]">
												{entry.url}
											</code>
										</a>
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{formatDate(entry.lastModified)}
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{entry.priority !== undefined ? entry.priority : "—"}
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 px-2"
											onClick={() => window.open(entry.url, "_blank")}
										>
											<ExternalLink className="h-3 w-3" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				{/* Mobile cards */}
				<div className="md:hidden space-y-3">
					{matchingEntries.map((entry, idx) => (
						<div key={idx} className="rounded-lg border p-3 space-y-2">
							<div className="flex items-start justify-between gap-2">
								<a
									href={entry.url}
									target="_blank"
									rel="noopener noreferrer"
									className="font-mono text-xs text-primary break-all hover:underline"
								>
									{entry.url}
								</a>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0 shrink-0"
									onClick={() => window.open(entry.url, "_blank")}
								>
									<ExternalLink className="h-3 w-3" />
								</Button>
							</div>
							<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
								{entry.lastModified && (
									<span>{formatDate(entry.lastModified)}</span>
								)}
								{entry.priority !== undefined && (
									<span>Priority: {entry.priority}</span>
								)}
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * Route detail view
 */
function RouteDetail({
	route,
	pluginName,
	sitemapEntries,
	siteBasePath,
}: {
	route: DocumentedRoute;
	pluginName: string;
	sitemapEntries: PluginSitemapEntry[];
	siteBasePath: string;
}) {
	return (
		<div className="space-y-4">
			{/* Route metadata if available */}
			{route.meta && (route.meta.title || route.meta.description) && (
				<Card>
					<CardHeader className="pb-3">
						{route.meta.title && (
							<CardTitle className="text-lg sm:text-xl">
								{route.meta.title}
							</CardTitle>
						)}
					</CardHeader>
					{(route.meta.description ||
						(route.meta.tags && route.meta.tags.length > 0)) && (
						<CardContent className="space-y-3">
							{route.meta.description && (
								<p className="text-muted-foreground text-sm sm:text-base">
									{route.meta.description}
								</p>
							)}
							{route.meta.tags && route.meta.tags.length > 0 && (
								<div className="flex flex-wrap gap-2">
									{route.meta.tags.map((tag) => (
										<Badge key={tag} variant="secondary">
											{tag}
										</Badge>
									))}
								</div>
							)}
						</CardContent>
					)}
				</Card>
			)}

			{/* Route path */}
			<div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
				<div className="font-mono overflow-x-auto">
					<HighlightedPath path={route.path} />
				</div>
				<Badge variant="outline">{pluginName}</Badge>
			</div>

			{/* Navigation form */}
			<NavigationForm route={route} siteBasePath={siteBasePath} />

			{/* Path parameters */}
			<ParametersSection params={route.pathParams} title="Path Parameters" />

			{/* Query parameters */}
			<ParametersSection params={route.queryParams} title="Query Parameters" />

			{/* Sitemap entries for this route */}
			<RouteSitemapSection route={route} sitemapEntries={sitemapEntries} />
		</div>
	);
}

/**
 * Generate a unique anchor ID for a route
 */
function getRouteAnchorId(pluginKey: string, routeKey: string): string {
	return `route-${pluginKey}-${routeKey}`;
}

/**
 * Sidebar route item - now an anchor link
 */
function SidebarRouteItem({
	route,
	pluginKey,
	onNavigate,
}: {
	route: DocumentedRoute;
	pluginKey: string;
	onNavigate?: () => void;
}) {
	const anchorId = getRouteAnchorId(pluginKey, route.key);

	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		const element = document.getElementById(anchorId);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
			// Update URL hash without scrolling (scrollIntoView handles it)
			window.history.pushState(null, "", `#${anchorId}`);
		}
		onNavigate?.();
	};

	return (
		<a
			href={`#${anchorId}`}
			onClick={handleClick}
			className="flex items-center w-full justify-start font-mono text-xs h-auto py-2 px-3 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
		>
			<FileText className="mr-2 h-3 w-3 shrink-0" />
			<span className="truncate">{route.path}</span>
		</a>
	);
}

/**
 * Sidebar plugin group
 */
function SidebarPluginGroup({
	plugin,
	onNavigate,
}: {
	plugin: DocumentedPlugin;
	onNavigate?: () => void;
}) {
	const [isExpanded, setIsExpanded] = useState(true);

	return (
		<div className="space-y-1">
			<Button
				variant="ghost"
				size="sm"
				className="w-full justify-between font-medium h-auto py-2"
				onClick={() => setIsExpanded(!isExpanded)}
			>
				<span className="flex items-center">
					{isExpanded ? (
						<FolderOpen className="mr-2 h-4 w-4" />
					) : (
						<Folder className="mr-2 h-4 w-4" />
					)}
					{plugin.name}
				</span>
				<ChevronRight
					className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
				/>
			</Button>
			{isExpanded && (
				<div className="ml-2 space-y-0.5">
					{plugin.routes.map((route) => (
						<SidebarRouteItem
							key={route.key}
							route={route}
							pluginKey={plugin.key}
							onNavigate={onNavigate}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/**
 * Sidebar content (shared between desktop and mobile)
 */
function SidebarContent({
	schema,
	onNavigate,
}: {
	schema: RouteDocsSchema;
	onNavigate?: () => void;
}) {
	return (
		<div className="p-3 space-y-4">
			{schema.plugins.map((plugin) => (
				<SidebarPluginGroup
					key={plugin.key}
					plugin={plugin}
					onNavigate={onNavigate}
				/>
			))}
		</div>
	);
}

/**
 * Mobile-friendly route card for the routes list
 */
function RouteCard({
	pluginName,
	route,
	hasParams,
	staticUrl,
	sitemapCount = 0,
	onSelect,
}: {
	pluginName: string;
	route: DocumentedRoute;
	hasParams: boolean;
	staticUrl: string | null;
	sitemapCount?: number;
	onSelect: () => void;
}) {
	return (
		<div className="rounded-lg border p-4 space-y-3">
			<div className="flex items-start justify-between gap-2">
				<button onClick={onSelect} className="text-left hover:underline">
					<code className="font-mono text-sm text-primary break-all">
						{route.path}
					</code>
				</button>
				{staticUrl ? (
					<Button
						variant="ghost"
						size="sm"
						className="h-8 w-8 p-0 shrink-0"
						onClick={() => window.open(staticUrl, "_blank")}
					>
						<ExternalLink className="h-4 w-4" />
					</Button>
				) : (
					<Button
						variant="ghost"
						size="sm"
						className="h-8 w-8 p-0 shrink-0"
						onClick={onSelect}
					>
						<Navigation className="h-4 w-4" />
					</Button>
				)}
			</div>
			{route.meta?.title && (
				<p className="text-sm text-muted-foreground">{route.meta.title}</p>
			)}
			<div className="flex flex-wrap gap-2">
				<Badge variant="outline" className="text-xs">
					{pluginName}
				</Badge>
				{hasParams && (
					<Badge variant="secondary" className="text-xs">
						{route.pathParams.length} param
						{route.pathParams.length > 1 ? "s" : ""}
					</Badge>
				)}
				{sitemapCount > 0 && (
					<Badge variant="secondary" className="text-xs">
						<Link2 className="h-3 w-3 mr-1" />
						{sitemapCount} in sitemap
					</Badge>
				)}
			</div>
		</div>
	);
}

/**
 * Format a date for display
 */
function formatDate(date: string | Date | undefined): string {
	if (!date) return "—";
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/**
 * Sitemap section - displays all sitemap entries
 */
function SitemapSection({
	entries,
	schema,
}: {
	entries: PluginSitemapEntry[];
	schema: RouteDocsSchema;
}) {
	const [isExpanded, setIsExpanded] = useState(false);

	// Get plugin name from schema
	const getPluginName = (pluginKey: string): string => {
		const plugin = schema.plugins.find((p) => p.key === pluginKey);
		return plugin?.name || pluginKey;
	};

	if (entries.length === 0) return null;

	// Show first 10 entries by default, all when expanded
	const displayedEntries = isExpanded ? entries : entries.slice(0, 10);
	const hasMore = entries.length > 10;

	return (
		<Card>
			<CardHeader className="pb-3 sm:pb-6">
				<CardTitle className="text-lg flex items-center gap-2">
					<Globe className="h-5 w-5" />
					Sitemap Entries
					<Badge variant="secondary" className="ml-2">
						{entries.length}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent>
				{/* Desktop table */}
				<div className="hidden md:block rounded-lg border overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>URL</TableHead>
								<TableHead className="w-[100px]">Plugin</TableHead>
								<TableHead className="w-[120px]">Last Modified</TableHead>
								<TableHead className="w-[80px]">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{displayedEntries.map((entry, idx) => (
								<TableRow key={`${entry.pluginKey}-${idx}`}>
									<TableCell>
										<a
											href={entry.url}
											target="_blank"
											rel="noopener noreferrer"
											className="hover:underline"
										>
											<code className="font-mono text-xs text-primary truncate block max-w-[400px]">
												{entry.url}
											</code>
										</a>
									</TableCell>
									<TableCell>
										<Badge variant="outline" className="text-xs">
											{getPluginName(entry.pluginKey)}
										</Badge>
									</TableCell>
									<TableCell className="text-xs text-muted-foreground">
										{formatDate(entry.lastModified)}
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="sm"
											className="h-7 px-2"
											onClick={() => window.open(entry.url, "_blank")}
										>
											<ExternalLink className="h-3 w-3" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				{/* Mobile cards */}
				<div className="md:hidden space-y-3">
					{displayedEntries.map((entry, idx) => (
						<div key={idx} className="rounded-lg border p-3 space-y-2">
							<div className="flex items-start justify-between gap-2">
								<a
									href={entry.url}
									target="_blank"
									rel="noopener noreferrer"
									className="font-mono text-xs text-primary break-all hover:underline"
								>
									{entry.url}
								</a>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 w-7 p-0 shrink-0"
									onClick={() => window.open(entry.url, "_blank")}
								>
									<ExternalLink className="h-3 w-3" />
								</Button>
							</div>
							<div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
								<Badge variant="outline" className="text-xs">
									{getPluginName(entry.pluginKey)}
								</Badge>
								{entry.lastModified && (
									<span>{formatDate(entry.lastModified)}</span>
								)}
							</div>
						</div>
					))}
				</div>

				{/* Show more button */}
				{hasMore && (
					<div className="mt-4 text-center">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setIsExpanded(!isExpanded)}
						>
							{isExpanded ? "Show less" : `Show all ${entries.length} entries`}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * All routes section - table on desktop, cards on mobile
 */
function AllRoutesSection({
	schema,
	siteBasePath,
}: {
	schema: RouteDocsSchema;
	siteBasePath: string;
}) {
	const scrollToRoute = (pluginKey: string, routeKey: string) => {
		const anchorId = getRouteAnchorId(pluginKey, routeKey);
		const element = document.getElementById(anchorId);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
			window.history.pushState(null, "", `#${anchorId}`);
		}
	};
	const allRoutes = useMemo(() => {
		const routes: Array<{
			pluginKey: string;
			pluginName: string;
			route: DocumentedRoute;
			hasParams: boolean;
			staticUrl: string | null;
			sitemapCount: number;
		}> = [];

		for (const plugin of schema.plugins) {
			for (const route of plugin.routes) {
				const hasParams = route.pathParams.length > 0;

				// Count sitemap entries that match this route pattern
				let sitemapCount = 0;
				if (!hasParams) {
					// Static route - count exact matches
					sitemapCount = plugin.sitemapEntries.filter((e) => {
						try {
							const url = new URL(e.url);
							return url.pathname.endsWith(route.path);
						} catch {
							return false;
						}
					}).length;
				} else {
					// Dynamic route - count entries that could match the pattern
					const routePattern = escapeRegexForRoutePath(route.path);
					const regex = new RegExp(`${routePattern}$`);
					sitemapCount = plugin.sitemapEntries.filter((e) => {
						try {
							const url = new URL(e.url);
							return regex.test(url.pathname);
						} catch {
							return false;
						}
					}).length;
				}

				routes.push({
					pluginKey: plugin.key,
					pluginName: plugin.name,
					route,
					hasParams,
					staticUrl: hasParams ? null : `${siteBasePath}${route.path}`,
					sitemapCount,
				});
			}
		}

		return routes;
	}, [schema, siteBasePath]);

	if (allRoutes.length === 0) return null;

	return (
		<Card>
			<CardHeader className="pb-3 sm:pb-6">
				<CardTitle className="text-lg">All Routes</CardTitle>
			</CardHeader>
			<CardContent>
				{/* Desktop table */}
				<div className="hidden md:block rounded-lg border overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Route</TableHead>
								<TableHead className="w-[100px]">Plugin</TableHead>
								<TableHead className="w-[80px]">Params</TableHead>
								<TableHead className="w-[80px]">Sitemap</TableHead>
								<TableHead className="w-[80px]">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{allRoutes.map(
								({
									pluginKey,
									pluginName,
									route,
									hasParams,
									staticUrl,
									sitemapCount,
								}) => (
									<TableRow key={`${pluginKey}-${route.key}`}>
										<TableCell>
											<button
												onClick={() => scrollToRoute(pluginKey, route.key)}
												className="text-left hover:underline"
											>
												<code className="font-mono text-sm text-primary">
													{route.path}
												</code>
											</button>
											{route.meta?.title && (
												<p className="text-xs text-muted-foreground mt-1">
													{route.meta.title}
												</p>
											)}
										</TableCell>
										<TableCell>
											<Badge variant="outline" className="text-xs">
												{pluginName}
											</Badge>
										</TableCell>
										<TableCell>
											{hasParams ? (
												<Badge variant="secondary" className="text-xs">
													{route.pathParams.length}
												</Badge>
											) : (
												<span className="text-xs text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											{sitemapCount > 0 ? (
												<Badge variant="secondary" className="text-xs">
													<Link2 className="h-3 w-3 mr-1" />
													{sitemapCount}
												</Badge>
											) : (
												<span className="text-xs text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>
											{staticUrl ? (
												<Button
													variant="ghost"
													size="sm"
													className="h-7 px-2"
													onClick={() => window.open(staticUrl, "_blank")}
												>
													<ExternalLink className="h-3 w-3" />
												</Button>
											) : (
												<Button
													variant="ghost"
													size="sm"
													className="h-7 px-2"
													onClick={() => scrollToRoute(pluginKey, route.key)}
												>
													<Navigation className="h-3 w-3" />
												</Button>
											)}
										</TableCell>
									</TableRow>
								),
							)}
						</TableBody>
					</Table>
				</div>

				{/* Mobile cards */}
				<div className="md:hidden space-y-3">
					{allRoutes.map(
						({
							pluginKey,
							pluginName,
							route,
							hasParams,
							staticUrl,
							sitemapCount,
						}) => (
							<RouteCard
								key={`${pluginKey}-${route.key}`}
								pluginName={pluginName}
								route={route}
								hasParams={hasParams}
								staticUrl={staticUrl}
								sitemapCount={sitemapCount}
								onSelect={() => scrollToRoute(pluginKey, route.key)}
							/>
						),
					)}
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * Route documentation page component
 */
export interface DocsPageProps {
	title?: string;
	description?: string;
	siteBasePath?: string;
}

export function DocsPageComponent({
	title = "Route Documentation",
	description = "Documentation for all client routes in your application",
	siteBasePath = "/pages",
}: DocsPageProps) {
	// Read schema from React Query (prefetched by loader on server, or generated on client)
	const { data: schema } = useSuspenseQuery<RouteDocsSchema>({
		queryKey: ROUTE_DOCS_QUERY_KEY,
		queryFn: generateSchema,
		staleTime: Infinity, // Don't refetch - schema is static for this session
	});
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	const totalRoutes = schema.plugins.reduce(
		(sum, p) => sum + p.routes.length,
		0,
	);

	const handleMobileNavigate = () => {
		setMobileMenuOpen(false);
	};

	return (
		<div className="flex min-h-screen bg-background">
			{/* Desktop Sidebar - sticky */}
			<aside className="hidden md:block w-72 border-r bg-card shrink-0 sticky top-0 h-screen">
				<div className="p-4 border-b">
					<h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
						Routes
					</h2>
				</div>
				<ScrollArea className="h-[calc(100vh-57px)]">
					<SidebarContent schema={schema} />
				</ScrollArea>
			</aside>

			{/* Mobile Header with Menu */}
			<div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b">
				<div className="flex items-center justify-between p-4">
					<h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
						Route Docs
					</h2>
					<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
						<SheetTrigger asChild>
							<Button variant="outline" size="sm">
								<Menu className="h-4 w-4 mr-2" />
								Routes
							</Button>
						</SheetTrigger>
						<SheetContent side="left" className="w-80 p-0">
							<SheetHeader className="p-4 border-b">
								<SheetTitle className="text-left text-sm text-muted-foreground uppercase tracking-wide">
									Routes
								</SheetTitle>
							</SheetHeader>
							<ScrollArea className="h-[calc(100vh-57px)]">
								<SidebarContent
									schema={schema}
									onNavigate={handleMobileNavigate}
								/>
							</ScrollArea>
						</SheetContent>
					</Sheet>
				</div>
			</div>

			{/* Main content - scrollable list of all routes */}
			<main className="flex-1 overflow-auto pt-16 md:pt-0">
				<div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
					<div className="space-y-6 sm:space-y-8">
						{/* Header */}
						<div>
							<h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
								{title}
							</h1>
							<p className="text-muted-foreground mt-2 text-sm sm:text-base">
								{description}
							</p>
						</div>

						<Separator />

						{totalRoutes > 0 ? (
							<>
								{/* Summary badges */}
								<div className="flex flex-wrap gap-2">
									<Badge variant="secondary">
										{schema.plugins.length} plugins
									</Badge>
									<Badge variant="secondary">{totalRoutes} routes</Badge>
									{schema.allSitemapEntries.length > 0 && (
										<Badge variant="secondary">
											<Globe className="h-3 w-3 mr-1" />
											{schema.allSitemapEntries.length} sitemap entries
										</Badge>
									)}
								</div>

								{/* All routes overview table */}
								<AllRoutesSection schema={schema} siteBasePath={siteBasePath} />

								{/* All route details - one after another */}
								{schema.plugins.map((plugin) => (
									<div key={plugin.key} className="space-y-6">
										{/* Plugin header */}
										<div className="flex items-center gap-2 pt-4">
											<Folder className="h-6 w-6 text-muted-foreground" />
											<h2 className="text-2xl font-semibold">{plugin.name}</h2>
											<Badge variant="outline">
												{plugin.routes.length} routes
											</Badge>
										</div>

										{/* Routes in this plugin */}
										{plugin.routes.map((route) => (
											<div
												key={route.key}
												id={getRouteAnchorId(plugin.key, route.key)}
												className="scroll-mt-20 md:scroll-mt-4"
											>
												<RouteDetail
													route={route}
													pluginName={plugin.name}
													sitemapEntries={plugin.sitemapEntries}
													siteBasePath={siteBasePath}
												/>
											</div>
										))}

										<Separator />
									</div>
								))}

								{/* Global sitemap section */}
								<SitemapSection
									entries={schema.allSitemapEntries}
									schema={schema}
								/>
							</>
						) : (
							<Card>
								<CardContent className="py-8 sm:py-12 text-center">
									<p className="text-muted-foreground">
										No documented routes found.
									</p>
									<p className="text-sm text-muted-foreground mt-2">
										Add client plugins with routes to see documentation here.
									</p>
								</CardContent>
							</Card>
						)}
					</div>
				</div>
			</main>
		</div>
	);
}
