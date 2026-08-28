import { createRouter } from "@btst/yar";

import type {
	ClientStackConfig,
	ClientStack,
	ClientPlugin,
	ClientPluginRegistration,
	ClientStackContext,
	LegacyClientStackConfig,
	PluginRoutes,
	ResolvedClientStack,
	ResolvedClientStackConfig,
	Sitemap,
} from "../types";
import { resolveClientRuntime } from "./runtime";
export type {
	ClientApiConfig,
	ClientApiEndpointOverride,
	ClientLocation,
	ClientLocationOverride,
	ClientPluginEndpointOverride,
	ClientPluginEndpointOverrides,
	ClientProviderApi,
	ClientProviderPluginRuntime,
	ClientProviderProjection,
	ClientPlugin,
	ClientPluginDefinition,
	ClientPluginRegistration,
	ClientStackContext,
	ResolvedClientApi,
	ResolvedClientPluginRuntime,
	ResolvedClientStack,
	ResolvedClientStackConfig,
} from "../types";

type AnyPluginMap = Record<string, ClientPluginRegistration<any, any>>;
type LegacyPluginMap = Record<string, ClientPlugin<any, any>>;

function hasResolvedRuntime<TPlugins extends AnyPluginMap>(
	config: ClientStackConfig<TPlugins>,
): config is ResolvedClientStackConfig<TPlugins> {
	return (
		"api" in config ||
		"site" in config ||
		"queryClient" in config ||
		"endpoints" in config
	);
}

/**
 * Resolves all registered client plugin definitions against one API location,
 * site location, and React Query client.
 *
 * Create a request-specific instance with `api.headers` for SSR/SSG and a
 * separate browser instance without request headers. The returned `provider`
 * projection contains no request headers.
 *
 * @example
 * ```ts
 * const clientStack = createClientStack({
 *   api: {
 *     baseURL: "https://app.example.com",
 *     basePath: "/api/data",
 *     headers: requestHeaders,
 *   },
 *   site: {
 *     baseURL: "https://app.example.com",
 *     basePath: "/pages",
 *   },
 *   queryClient,
 *   plugins: {
 *     example: exampleClientPlugin(),
 *   },
 * });
 * ```
 *
 * @template TPlugins - The exact plugins map (inferred from config)
 * @template TRoutes - All routes from all plugins, merged (computed automatically)
 */
export function createClientStack<
	TPlugins extends AnyPluginMap,
	TRoutes extends PluginRoutes<TPlugins> = PluginRoutes<TPlugins>,
>(
	config: ResolvedClientStackConfig<TPlugins>,
): ResolvedClientStack<TRoutes, TPlugins>;
export function createClientStack<
	TPlugins extends LegacyPluginMap,
	TRoutes extends PluginRoutes<TPlugins> = PluginRoutes<TPlugins>,
>(config: LegacyClientStackConfig<TPlugins>): ClientStack<TRoutes>;
export function createClientStack<
	TPlugins extends AnyPluginMap,
	TRoutes extends PluginRoutes<TPlugins> = PluginRoutes<TPlugins>,
>(config: ClientStackConfig<TPlugins>): ClientStack<TRoutes>;
export function createClientStack<
	TPlugins extends AnyPluginMap,
	TRoutes extends PluginRoutes<TPlugins> = PluginRoutes<TPlugins>,
>(
	config: ClientStackConfig<TPlugins>,
): ClientStack<TRoutes> | ResolvedClientStack<TRoutes, TPlugins> {
	const canonical = hasResolvedRuntime(config);
	const runtime = canonical ? resolveClientRuntime(config) : undefined;
	const resolvedPlugins: Record<string, ClientPlugin<any, any>> = {};

	for (const [pluginKey, registration] of Object.entries(config.plugins)) {
		if ("resolve" in registration) {
			if (!runtime) {
				throw new Error(
					`[btst/client] Client plugin "${pluginKey}" is a runtime-independent definition. Configure api, site, and queryClient on createClientStack().`,
				);
			}
			const resolution = registration.resolve(
				runtime.pluginRuntimes[pluginKey]!,
			);
			if (!resolution || typeof resolution.routes !== "function") {
				throw new Error(
					`[btst/client] Client plugin "${pluginKey}" did not resolve to a routes() function.`,
				);
			}
			resolvedPlugins[pluginKey] = {
				name: registration.name,
				...resolution,
			};
		} else {
			resolvedPlugins[pluginKey] = registration;
		}
	}

	const plugins = resolvedPlugins as Record<string, ClientPlugin<any, any>>;
	const basePath = canonical
		? runtime!.provider.site.basePath
		: config.basePath;

	// Collect all routes from all plugins
	// We build this with type assertions to preserve literal keys
	const allRoutes = {} as TRoutes;

	// Create the context object to pass to plugin routes
	const clientStackContext: ClientStackContext = {
		plugins,
		basePath,
	};

	for (const [pluginKey, plugin] of Object.entries(plugins)) {
		// Add routes - pass the context for plugins that need introspection (e.g., routeDocs)
		const pluginRoutes = plugin.routes(clientStackContext);
		Object.assign(allRoutes, pluginRoutes);
	}

	// Create the composed router - TypeScript will infer the router type
	// The router's getRoute method will return the union of all route return types
	const router = createRouter<TRoutes, {}>(allRoutes);

	const result: ClientStack<TRoutes> = {
		router,
		async generateSitemap() {
			const sitemapEntries: Sitemap = [];
			for (const plugin of Object.values(plugins)) {
				if (typeof plugin.sitemap === "function") {
					// Allow each plugin to return a partial sitemap
					const entries = await plugin.sitemap();
					if (Array.isArray(entries)) sitemapEntries.push(...entries);
				}
			}
			// De-duplicate by URL while preserving lastModified/priorities preferring the first occurrence
			const seen = new Set<string>();
			const deduped: Sitemap = [];
			for (const entry of sitemapEntries) {
				if (!entry?.url || seen.has(entry.url)) continue;
				seen.add(entry.url);
				deduped.push(entry);
			}
			return deduped;
		},
	};

	return runtime ? { ...result, provider: runtime.provider } : result;
}

/**
 * @deprecated Use `createClientStack`. This alias is removed by #225.
 */
export const createStackClient: typeof createClientStack = createClientStack;

export type {
	ClientStack,
	ClientStackConfig,
	ClientLib,
	ClientLibConfig,
} from "../types";

export { sitemapEntryToXmlString } from "./sitemap-utils";

export { metaElementsToObject } from "./meta-utils";

export { normalizePath } from "./path-utils";

export {
	parseListStateFromSearchParams,
	serializeListStateToSearchParams,
	listStateParamKey,
	resolveListStateHistoryMode,
	type InferListState,
	type ListStateField,
	type ListStateSchema,
	type SetListState,
	type SetListStateOptions,
} from "../shared/list-state";
