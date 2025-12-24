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
 * Module-level storage for the client stack context
 * This allows the schema to be generated on both server and client
 */
let moduleStoredContext: ClientStackContext | null = null;

/**
 * Get the stored client stack context
 * Used by the docs page component to generate schema on client-side navigation
 */
export function getStoredContext(): ClientStackContext | null {
	return moduleStoredContext;
}

/**
 * Generate the route docs schema from the stored context
 * This can be called from both server and client
 */
export async function generateSchema(): Promise<RouteDocsSchema> {
	if (!moduleStoredContext) {
		return {
			plugins: [],
			generatedAt: new Date().toISOString(),
			allSitemapEntries: [],
		};
	}

	try {
		const sitemapEntries = await fetchAllSitemapEntries(moduleStoredContext);
		return generateRouteDocsSchema(moduleStoredContext, sitemapEntries);
	} catch (error) {
		console.warn("Failed to generate route docs schema:", error);
		// Return schema without sitemap entries on error
		return generateRouteDocsSchema(moduleStoredContext, []);
	}
}

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
function createRouteDocsLoader(config: RouteDocsClientConfig) {
	return async () => {
		// Only run on server for SSR prefetching
		// Client-side navigation uses the queryFn in the component
		if (typeof window === "undefined" && moduleStoredContext) {
			const { queryClient } = config;

			try {
				// Await all sitemap entries from all plugins
				const sitemapEntries =
					await fetchAllSitemapEntries(moduleStoredContext);

				// Generate the complete schema with sitemap data
				const schema = generateRouteDocsSchema(
					moduleStoredContext,
					sitemapEntries,
				);

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
	return defineClientPlugin({
		name: "route-docs",

		routes: (context?: ClientStackContext) => {
			// Store context at module level for client-side schema generation
			moduleStoredContext = context || null;

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
						loader: createRouteDocsLoader(config),
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
