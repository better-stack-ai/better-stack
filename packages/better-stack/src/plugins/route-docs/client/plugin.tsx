import { lazy } from "react";
import { defineClientPlugin } from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import type { ClientStackContext } from "../../../types";
import {
	generateRouteDocsSchema,
	fetchAllSitemapEntries,
	type RouteDocsSchema,
} from "../generator";
import type { DocsPageProps } from "./components/pages/docs-page";

// Lazy load page components for code splitting
const DocsPageComponent = lazy(() =>
	import("./components/pages/docs-page").then((m) => ({
		default: m.DocsPageComponent as React.ComponentType<DocsPageProps>,
	})),
);

const DocsPageSkeleton = lazy(() =>
	import("./components/loading/docs-skeleton").then((m) => ({
		default: m.DocsPageSkeleton,
	})),
);

/**
 * Query key for route docs schema
 */
export const ROUTE_DOCS_QUERY_KEY = ["route-docs", "schema"] as const;

/**
 * Configuration for Route Docs client plugin
 */
export interface RouteDocsClientConfig {
	/** React Query client for SSR prefetching */
	queryClient: QueryClient;
	/** Title for the documentation page */
	title?: string;
	/** Description for the documentation page */
	description?: string;
	/** Site base path for constructing URLs (e.g., "/pages") */
	siteBasePath: string;
}

/**
 * Create meta generator for the docs page
 */
function createDocsMeta(config: RouteDocsClientConfig) {
	return () => {
		const title = config.title || "Route Documentation";
		return [
			{ title },
			{ name: "title", content: title },
			{ name: "robots", content: "noindex" },
		];
	};
}

/**
 * Default error component - no required props, matches other plugins
 */
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

/**
 * Create loader for SSR prefetching of route docs schema
 * This properly awaits all sitemap data before storing in React Query
 */
function createRouteDocsLoader(
	config: RouteDocsClientConfig,
	context: ClientStackContext | null,
) {
	return async () => {
		// Only run on server
		if (typeof window === "undefined" && context) {
			const { queryClient } = config;

			try {
				// Await all sitemap entries from all plugins
				const sitemapEntries = await fetchAllSitemapEntries(context);

				// Generate the complete schema with sitemap data
				const schema = generateRouteDocsSchema(context, sitemapEntries);

				// Store in React Query for the component to read
				queryClient.setQueryData<RouteDocsSchema>(ROUTE_DOCS_QUERY_KEY, schema);
			} catch (error) {
				console.warn("Failed to load route docs schema:", error);
				// Store empty schema on error
				queryClient.setQueryData<RouteDocsSchema>(ROUTE_DOCS_QUERY_KEY, {
					plugins: [],
					generatedAt: new Date().toISOString(),
					allSitemapEntries: [],
				});
			}
		}
	};
}

/**
 * Route Docs client plugin
 * Provides a route that displays documentation for all client routes
 */
export const routeDocsClientPlugin = (config: RouteDocsClientConfig) => {
	// Store the context for use in loader and schema generation
	let storedContext: ClientStackContext | null = null;

	return defineClientPlugin({
		name: "route-docs",

		routes: (context?: ClientStackContext) => {
			// Store context for generating schema
			storedContext = context || null;

			return {
				docs: createRoute("/route-docs", () => {
					return {
						PageComponent: () => (
							<DocsPageComponent
								title={config.title}
								description={config.description}
								siteBasePath={config.siteBasePath || "/pages"}
							/>
						),
						LoadingComponent: () => <DocsPageSkeleton />,
						ErrorComponent: () => <DocsErrorComponent />,
						loader: createRouteDocsLoader(config, storedContext),
						meta: createDocsMeta(config),
					};
				}),
			};
		},

		sitemap: async () => {
			// Route docs page should NOT be in sitemap
			return [];
		},
	});
};
