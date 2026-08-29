import { lazy, type ComponentType } from "react";
import {
	defineClientPlugin,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import { normalizePath } from "@btst/stack/client";
import { defineRoute } from "@btst/yar";
import { hashKey, type QueryClient } from "@tanstack/react-query";
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
const ROUTE_DOCS_KEY_RESOLUTION = ["route-docs", "schema-key"] as const;

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
	/** Optional replacement for the Route Docs page. */
	pageComponents?: {
		/** Replaces the interactive route documentation page. */
		docs?: ComponentType<DocsPageProps>;
	};
}

interface ResolvedRouteDocsClientConfig extends RouteDocsClientConfig {
	queryClient: QueryClient;
	siteBaseURL: string;
	siteBasePath: string;
}

const resolvedSchemaKeysByContext = new WeakMap<ClientStackContext, string>();
const contextFallbackKeysByQueryClient = new WeakMap<
	QueryClient,
	{
		nextKey: number;
		keys: WeakMap<ClientStackContext, number>;
	}
>();

function createRouteDocsBaseFingerprint(
	config: ResolvedRouteDocsClientConfig,
	context: ClientStackContext | null,
) {
	// Framework entry factories may reconstruct the same stack between the loader
	// and render. Hash schema inputs, never process-local object identities.
	const schemaInputs = context
		? generateRouteDocsSchema(context, []).plugins.map(
				({ sitemapEntries: _sitemapEntries, ...plugin }) => plugin,
			)
		: [];
	const registrations = context
		? Object.entries(context.plugins)
				.map(([key, plugin]) => ({
					key,
					id: resolvePluginProgrammaticId(plugin, key),
				}))
				.sort((left, right) => left.key.localeCompare(right.key))
		: [];
	return hashKey([
		{
			basePath: context?.basePath ?? null,
			siteBaseURL: config.siteBaseURL,
			siteBasePath: config.siteBasePath,
			registrations,
			schemaInputs,
		},
	]);
}

function createSchemaQueryKey(fingerprint: string) {
	return [...ROUTE_DOCS_QUERY_KEY, fingerprint] as const;
}

function createSchemaKeyResolutionQueryKey(baseFingerprint: string) {
	return [...ROUTE_DOCS_KEY_RESOLUTION, baseFingerprint] as const;
}

function getContextFallbackKey(
	queryClient: QueryClient,
	context: ClientStackContext,
) {
	let state = contextFallbackKeysByQueryClient.get(queryClient);
	if (!state) {
		state = { nextKey: 0, keys: new WeakMap() };
		contextFallbackKeysByQueryClient.set(queryClient, state);
	}
	let key = state.keys.get(context);
	if (key === undefined) {
		key = state.nextKey++;
		state.keys.set(context, key);
	}
	return key;
}

function resolveRouteDocsQueryKey(
	config: ResolvedRouteDocsClientConfig,
	context: ClientStackContext | null,
) {
	const baseFingerprint = createRouteDocsBaseFingerprint(config, context);
	// Loaders record every sitemap-complete key under this deterministic alias.
	// A single dehydrated variant lets an equivalent reconstructed page find it;
	// ambiguous variants fall back to isolated context keys below.
	const aliases = config.queryClient.getQueryData<string[]>(
		createSchemaKeyResolutionQueryKey(baseFingerprint),
	);
	const resolvedFingerprint = context
		? (resolvedSchemaKeysByContext.get(context) ??
			(aliases?.length === 1 ? aliases[0] : undefined))
		: undefined;
	if (resolvedFingerprint) return createSchemaQueryKey(resolvedFingerprint);
	if (context) {
		return createSchemaQueryKey(
			hashKey([
				{
					baseFingerprint,
					contextFallback: getContextFallbackKey(config.queryClient, context),
				},
			]),
		);
	}
	return createSchemaQueryKey(baseFingerprint);
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
) {
	return async () => {
		if (typeof window !== "undefined" || !context) return;

		try {
			const sitemapEntries = await fetchAllSitemapEntries(context);
			const schema = generateRouteDocsSchema(context, sitemapEntries);
			const baseFingerprint = createRouteDocsBaseFingerprint(config, context);
			const resolvedFingerprint = hashKey([
				{ baseFingerprint, sitemapEntries },
			]);
			const queryKey = createSchemaQueryKey(resolvedFingerprint);
			resolvedSchemaKeysByContext.set(context, resolvedFingerprint);
			config.queryClient.setQueryData<string[]>(
				createSchemaKeyResolutionQueryKey(baseFingerprint),
				(previous = []) =>
					previous.includes(resolvedFingerprint)
						? previous
						: [...previous, resolvedFingerprint],
			);
			config.queryClient.setQueryData<RouteDocsSchema>(queryKey, schema);
		} catch (error) {
			console.warn("Failed to load route docs schema:", error);
			const queryKey = resolveRouteDocsQueryKey(config, context);
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
			return {
				docs: defineRoute("/route-docs", {
					page: () => {
						const PageComponent =
							config.pageComponents?.docs ?? DocsPageComponent;
						return (
							<PageComponent
								title={config.title}
								description={config.description}
								siteBaseURL={config.siteBaseURL}
								siteBasePath={config.siteBasePath}
								queryKey={resolveRouteDocsQueryKey(config, resolvedContext)}
							/>
						);
					},
					loading: DocsPageSkeleton,
					error: DocsErrorComponent,
					loader: createRouteDocsLoader(config, resolvedContext),
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
