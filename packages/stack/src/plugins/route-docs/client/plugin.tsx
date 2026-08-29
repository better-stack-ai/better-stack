import { lazy, type ComponentType } from "react";
import {
	defineClientPlugin,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import { normalizePath } from "@btst/stack/client";
import { defineRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import type { ClientStackContext } from "../../../types";
import { resolvePluginProgrammaticId } from "../../../plugin-registration";
import {
	generateRouteDocsSchema,
	fetchAllSitemapEntries,
	type RouteDocsSchema,
} from "../generator";
import type { DocsPageProps } from "./components/pages/docs-page";
import { ROUTE_DOCS_PLUGIN_ID } from "./constants";
import { createEmptySchema } from "./schema";

export { generateSchema } from "./schema";

const DocsPageComponent = lazy(() =>
	import("./components/pages/docs-page").then((module) => ({
		default: module.DocsPageComponent as ComponentType<DocsPageProps>,
	})),
);

const DocsPageSkeleton = lazy(() =>
	import("./components/loading/docs-skeleton").then((module) => ({
		default: module.DocsPageSkeleton,
	})),
);

/** Query-key prefix for Route Docs schema caches. */
export const ROUTE_DOCS_QUERY_KEY = ["route-docs", "schema"] as const;

export interface RegisteredRoute {
	/** The route path pattern (for example, `/blog/:slug`). */
	path: string;
	/** Canonical programmatic ID of the plugin that owns the route. */
	plugin: string;
	/** Route key within the plugin. */
	key: string;
}

/** Returns all registered routes except Route Docs' own introspection page. */
export function getRegisteredRoutes(
	context: ClientStackContext | null,
): RegisteredRoute[] {
	if (!context) return [];
	const result: RegisteredRoute[] = [];
	for (const [pluginKey, plugin] of Object.entries(context.plugins)) {
		const pluginId = resolvePluginProgrammaticId(plugin, pluginKey);
		if (pluginId === ROUTE_DOCS_PLUGIN_ID) continue;
		try {
			const routes = plugin.routes(context);
			for (const [routeKey, route] of Object.entries(routes)) {
				const path = (route as { path?: unknown }).path;
				if (typeof path === "string" && path.length > 0) {
					result.push({ path, plugin: pluginId, key: routeKey });
				}
			}
		} catch {
			// Introspection deliberately skips definitions that cannot expose routes.
		}
	}
	return result;
}

/** Route Docs-specific presentation configuration. */
export interface RouteDocsClientConfig {
	/** Title for the documentation page. */
	title?: string;
	/** Description for the documentation page. */
	description?: string;
}

interface ResolvedRouteDocsClientConfig extends RouteDocsClientConfig {
	queryClient: QueryClient;
	siteBaseURL: string;
	siteBasePath: string;
}

interface RouteDocsContextIdentityRegistry {
	nextIdentity: number;
	identities: WeakMap<ClientStackContext, number>;
}

const contextIdentitiesByQueryClient = new WeakMap<
	QueryClient,
	RouteDocsContextIdentityRegistry
>();

function getContextIdentity(
	queryClient: QueryClient,
	context: ClientStackContext,
): number {
	let registry = contextIdentitiesByQueryClient.get(queryClient);
	if (!registry) {
		registry = {
			nextIdentity: 0,
			identities: new WeakMap<ClientStackContext, number>(),
		};
		contextIdentitiesByQueryClient.set(queryClient, registry);
	}

	let identity = registry.identities.get(context);
	if (identity === undefined) {
		identity = registry.nextIdentity;
		registry.nextIdentity += 1;
		registry.identities.set(context, identity);
	}
	return identity;
}

function createRouteDocsQueryKey(
	config: ResolvedRouteDocsClientConfig,
	context: ClientStackContext | null,
) {
	const routeSet = getRegisteredRoutes(context).sort((left, right) =>
		`${left.plugin}:${left.key}:${left.path}`.localeCompare(
			`${right.plugin}:${right.key}:${right.path}`,
		),
	);
	return [
		...ROUTE_DOCS_QUERY_KEY,
		JSON.stringify({
			contextIdentity: context
				? getContextIdentity(config.queryClient, context)
				: null,
			basePath: context?.basePath ?? null,
			siteBaseURL: config.siteBaseURL,
			siteBasePath: config.siteBasePath,
			routeSet,
		}),
	] as const;
}

function resolveRouteDocsClientConfig(
	config: RouteDocsClientConfig,
	runtime: ResolvedClientPluginRuntime<typeof ROUTE_DOCS_PLUGIN_ID>,
): ResolvedRouteDocsClientConfig {
	return {
		title: config.title,
		description: config.description,
		queryClient: runtime.queryClient,
		siteBaseURL: runtime.site.baseURL,
		siteBasePath: runtime.site.basePath,
	};
}

function createDocsMeta(config: ResolvedRouteDocsClientConfig) {
	return () => {
		const title = config.title ?? "Route Documentation";
		const description =
			config.description ??
			"Documentation for all client routes in your application";
		const sitePath = normalizePath(
			[config.siteBasePath, "/route-docs"].join("/"),
		);
		return [
			{ title },
			{ name: "title", content: title },
			{ name: "description", content: description },
			{ name: "robots", content: "noindex" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: `${config.siteBaseURL}${sitePath}` },
		];
	};
}

function DocsErrorComponent() {
	return (
		<div className="flex items-center justify-center min-h-screen bg-background">
			<div className="text-center">
				<h1 className="text-2xl font-semibold text-destructive mb-2">
					Error Loading Documentation
				</h1>
				<p className="text-muted-foreground">
					An error occurred while loading the documentation.
				</p>
			</div>
		</div>
	);
}

function createRouteDocsLoader(
	config: ResolvedRouteDocsClientConfig,
	context: ClientStackContext | null,
	queryKey: ReturnType<typeof createRouteDocsQueryKey>,
) {
	return async () => {
		if (typeof window !== "undefined" || !context) return;

		try {
			const sitemapEntries = await fetchAllSitemapEntries(context);
			const schema = generateRouteDocsSchema(context, sitemapEntries);
			config.queryClient.setQueryData<RouteDocsSchema>(queryKey, schema);
		} catch (error) {
			console.warn("Failed to load route docs schema:", error);
			config.queryClient.setQueryData<RouteDocsSchema>(
				queryKey,
				createEmptySchema(),
			);
		}
	};
}

function createResolvedRouteDocsPlugin(config: ResolvedRouteDocsClientConfig) {
	return {
		routes: (context?: ClientStackContext) => {
			const resolvedContext = context ?? null;
			const queryKey = createRouteDocsQueryKey(config, resolvedContext);
			return {
				docs: defineRoute("/route-docs", {
					page: () => (
						<DocsPageComponent
							title={config.title}
							description={config.description}
							siteBaseURL={config.siteBaseURL}
							siteBasePath={config.siteBasePath}
							queryKey={queryKey}
						/>
					),
					loading: DocsPageSkeleton,
					error: DocsErrorComponent,
					loader: createRouteDocsLoader(config, resolvedContext, queryKey),
					meta: createDocsMeta(config),
				}),
			};
		},
		sitemap: () => [],
	};
}

/** Registers the intentionally client-only Route Docs introspection plugin. */
export const routeDocsClientPlugin = (config: RouteDocsClientConfig = {}) =>
	defineClientPlugin({
		id: ROUTE_DOCS_PLUGIN_ID,
		resolve: (runtime) =>
			createResolvedRouteDocsPlugin(
				resolveRouteDocsClientConfig(config, runtime),
			),
	});
