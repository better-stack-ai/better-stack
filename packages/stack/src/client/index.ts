import { createRouter } from "@btst/yar";

import type {
	ClientStackConfig,
	ClientPlugin,
	ClientPluginDefinition,
	ClientPluginRegistration,
	ClientStackContext,
	PluginRoutes,
	ResolvedClientStack,
	Sitemap,
} from "../types";
import { resolveClientRuntime } from "./runtime";
import { resolvePluginRegistrationIds } from "../plugin-registration";
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

type AnyPluginMap = Record<
	string,
	ClientPluginRegistration<any, any, any, any, any>
>;

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
>(config: ClientStackConfig<TPlugins>): ResolvedClientStack<TRoutes, TPlugins> {
	const registrations = config.plugins;
	const registrationIds = resolvePluginRegistrationIds(registrations, "client");
	const validatedRegistrations = registrations as TPlugins;
	const runtime = resolveClientRuntime(config, registrationIds);
	const resolvedPlugins: Record<string, ClientPlugin<any, any>> = Object.create(
		null,
	);

	for (const [pluginKey, registration] of Object.entries(
		validatedRegistrations,
	)) {
		const definition = registration as ClientPluginDefinition<
			any,
			any,
			any,
			any,
			any
		>;
		if (
			!Object.hasOwn(definition, "resolve") ||
			typeof definition.resolve !== "function"
		) {
			throw new Error(
				`[btst/client] Client plugin "${pluginKey}" must declare an own resolve() function.`,
			);
		}
		const resolution = definition.resolve(runtime.pluginRuntimes[pluginKey]!);
		if (!resolution || typeof resolution.routes !== "function") {
			throw new Error(
				`[btst/client] Client plugin "${pluginKey}" did not resolve to a routes() function.`,
			);
		}
		resolvedPlugins[pluginKey] = {
			...resolution,
			id: registrationIds[pluginKey]!,
		};
	}

	const plugins = resolvedPlugins as Record<string, ClientPlugin<any, any>>;
	const basePath = runtime.provider.site.basePath;

	// Collect all routes from all plugins
	// We build this with type assertions to preserve literal keys
	const allRoutes = Object.create(null) as TRoutes;

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

	const result = {
		context: clientStackContext,
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
	} as const;

	return { ...result, provider: runtime.provider };
}

export type {
	ClientStack,
	ClientStackConfig,
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
