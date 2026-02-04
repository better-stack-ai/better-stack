import { createRouter } from "@btst/yar";

import type {
	ClientLibConfig,
	ClientLib,
	ClientPlugin,
	ClientStackContext,
	PluginRoutes,
	Sitemap,
} from "../types";
export type { ClientPlugin, ClientStackContext } from "../types";

/**
 * Creates the client library with plugin support
 *
 * @example
 * ```ts
 * // For Next.js with SSR:
 * const lib = createStackClient({
 *   plugins: {
 *     blog: blogPlugin.client
 *   }
 * });
 *
 * // SPA usage - just render the route
 * function Page() {
 *   return lib.resolveRoute('/blog');
 * }
 *
 * // SSR usage - prefetch data with loader, then render
 * async function Page({ params }) {
 *   const path = '/blog';
 *
 *   // Load data server-side if loader exists
 *   const loader = lib.getLoader(path);
 *   if (loader) await loader(queryClient, baseURL, basePath);
 *
 *   // Render with built-in Suspense + Error Boundary
 *   return lib.resolveRoute(path);
 * }
 *
 * // Next.js with notFound() function
 * import { notFound } from 'next/navigation';
 *
 * async function Page({ params }) {
 *   const path = '/blog';
 *   const loader = lib.getLoader(path);
 *   if (loader) await loader(queryClient, baseURL);
 *
 *   return lib.resolveRoute(path, {
 *     onNotFound: notFound // Calls Next.js notFound() instead of rendering
 *   });
 * }
 *
 * ```
 *
 * @template TPlugins - The exact plugins map (inferred from config)
 * @template TRoutes - All routes from all plugins, merged (computed automatically)
 */
export function createStackClient<
	TPlugins extends Record<string, ClientPlugin<any, any>>,
	TRoutes extends PluginRoutes<TPlugins> = PluginRoutes<TPlugins>,
>(config: ClientLibConfig<TPlugins>): ClientLib<TRoutes> {
	const { plugins, basePath } = config;

	// Collect all routes from all plugins
	// We build this with type assertions to preserve literal keys
	const allRoutes = {} as TRoutes;

	// Create the context object to pass to plugin routes
	const clientStackContext: ClientStackContext<TPlugins> = {
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

	return {
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
}

export type { ClientLib, ClientLibConfig };

export { sitemapEntryToXmlString } from "./sitemap-utils";

export { metaElementsToObject } from "./meta-utils";

export { normalizePath } from "./path-utils";
