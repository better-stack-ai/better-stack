import type { Route, createRouter } from "@btst/yar";
import type { Adapter, DatabaseDefinition, DbPlugin } from "@btst/db";
import type { Endpoint, Router } from "better-call";

/**
 * Context passed to backend plugins during route creation
 * Provides access to all registered plugins for introspection (used by openAPI plugin)
 */
export interface BetterStackContext {
	/** All registered backend plugins */
	plugins: Record<string, BackendPlugin<any>>;
	/** The API base path (e.g., "/api/data") */
	basePath: string;
	/** The database adapter */
	adapter: Adapter;
}

/**
 * Context passed to client plugins during route creation
 * Provides access to all registered plugins for introspection (used by routeDocs plugin)
 */
export interface ClientStackContext<
	TPlugins extends Record<string, ClientPlugin<any, any>> = Record<
		string,
		ClientPlugin<any, any>
	>,
> {
	/** All registered client plugins */
	plugins: TPlugins;
	/** The base path for the client (e.g., "/app") */
	basePath?: string;
}

/**
 * Backend plugin definition
 * Defines API routes and data access for a feature
 *
 * Note: Each plugin defines its own schema using createDbPlugin().
 * Better Stack composes all plugin schemas together at runtime using Better DB's .use() method.
 * You can optionally provide a base schema via the dbSchema config option.
 *
 * @template TRoutes - The exact shape of routes this plugin provides (preserves keys and endpoint types)
 */
export interface BackendPlugin<
	TRoutes extends Record<string, Endpoint> = Record<string, Endpoint>,
> {
	name: string;

	/**
	 * Create API endpoints for this plugin
	 * Returns an object with named endpoints that will be composed into the router
	 *
	 * @param adapter - Better DB adapter instance with methods:
	 *   create, update, updateMany, delete, deleteMany, findOne, findMany, count
	 * @param context - Optional context with access to all plugins (for introspection)
	 */
	routes: (adapter: Adapter, context?: BetterStackContext) => TRoutes;
	dbPlugin: DbPlugin;
}

/**
 * Frontend plugin definition
 * Defines pages, components, loaders, and React Query hooks for a feature
 *
 * @template TOverrides - The shape of overridable components/functions this plugin requires
 * Example: { Link: ComponentType<{href: string}>, navigate: (path: string) => void }
 * @template TRoutes - The exact shape of routes this plugin provides (preserves keys and route types)
 */
export interface ClientPlugin<
	TOverrides = Record<string, never>,
	TRoutes extends Record<string, Route> = Record<string, Route>,
> {
	name: string;

	/**
	 * Define routes (pages) for this plugin
	 * Returns yar routes that will be composed into the router
	 *
	 * @param context - Optional context with access to all plugins (for introspection)
	 */
	routes: (context?: ClientStackContext) => TRoutes;

	/**
	 * Optional sitemap generator for this plugin. Should return absolute URLs.
	 * Implementations can call their own API endpoints to include dynamic routes.
	 */
	sitemap?: () => Promise<Sitemap> | Sitemap;
}

/**
 * Configuration for creating the backend library
 */
export interface BackendLibConfig<
	TPlugins extends Record<string, BackendPlugin<any>> = Record<
		string,
		BackendPlugin<any>
	>,
> {
	basePath: string;
	dbSchema?: DatabaseDefinition;
	plugins: TPlugins;
	adapter: (db: DatabaseDefinition) => Adapter;
}

/**
 * Configuration for creating the client library
 */
export interface ClientLibConfig<
	TPlugins extends Record<string, ClientPlugin<any, any>> = Record<
		string,
		ClientPlugin<any, any>
	>,
> {
	plugins: TPlugins;
	baseURL?: string;
	basePath?: string;
}

/**
 * Utility type to extract override types from plugins
 * Maps plugin names to their override types
 */
export type InferPluginOverrides<
	TPlugins extends Record<string, ClientPlugin<any, any>>,
> = {
	[K in keyof TPlugins]: TPlugins[K] extends ClientPlugin<infer TOverrides, any>
		? TOverrides
		: never;
};

/**
 * Type for the pluginOverrides prop in BetterStackContext
 * Allows partial overrides per plugin
 */
export type PluginOverrides<
	TPlugins extends Record<string, ClientPlugin<any, any>>,
> = {
	[K in keyof TPlugins]?: Partial<InferPluginOverrides<TPlugins>[K]>;
};

/**
 * Extract all routes from all client plugins, merging them into a single record
 */
export type PluginRoutes<
	TPlugins extends Record<string, ClientPlugin<any, any>>,
> = MergeAllPluginRoutes<TPlugins>;

/**
 * Prefix all backend plugin route keys with the plugin name
 * Example: { messages: { list: Endpoint } } => { messages_list: Endpoint }
 */
export type PrefixedPluginRoutes<
	TPlugins extends Record<string, BackendPlugin<any>>,
> = UnionToIntersection<
	{
		[PluginKey in keyof TPlugins]: TPlugins[PluginKey] extends BackendPlugin<
			infer TRoutes
		>
			? {
					[RouteKey in keyof TRoutes as `${PluginKey & string}_${RouteKey & string}`]: TRoutes[RouteKey];
				}
			: never;
	}[keyof TPlugins]
> extends infer U
	? U extends Record<string, Endpoint>
		? U
		: Record<string, Endpoint>
	: Record<string, Endpoint>;

/**
 * Result of creating the backend library
 */
export interface BackendLib<
	TRoutes extends Record<string, Endpoint> = Record<string, Endpoint>,
> {
	handler: (request: Request) => Promise<Response>; // API route handler
	router: Router; // Better-call router
	dbSchema: DatabaseDefinition; // Better-db schema
}

/**
 * Helper type to extract routes from a client plugin
 */
export type ExtractPluginRoutes<T> = T extends ClientPlugin<any, infer TRoutes>
	? TRoutes
	: never;

/**
 * Helper type to merge all routes from all plugins into a single record
 */
export type MergeAllPluginRoutes<
	TPlugins extends Record<string, ClientPlugin<any, any>>,
> = UnionToIntersection<
	{
		[K in keyof TPlugins]: ExtractPluginRoutes<TPlugins[K]>;
	}[keyof TPlugins]
> extends infer U
	? U extends Record<string, Route>
		? U
		: Record<string, Route>
	: Record<string, Route>;

/**
 * Utility type to convert union to intersection
 */
type UnionToIntersection<U> = (
	U extends unknown
		? (k: U) => void
		: never
) extends (k: infer I) => void
	? I
	: never;

/**
 * Result of creating the client library
 */
export interface ClientLib<
	TRoutes extends Record<string, Route> = Record<string, Route>,
> {
	router: ReturnType<typeof createRouter<TRoutes, {}>>;
	generateSitemap: () => Promise<Sitemap>;
}

/**
 * Minimal sitemap entry shape aligned with Next.js MetadataRoute.Sitemap
 */
export type SitemapEntry = {
	url: string; // absolute
	lastModified?: string | Date;
	changeFrequency?:
		| "always"
		| "hourly"
		| "daily"
		| "weekly"
		| "monthly"
		| "yearly"
		| "never";
	priority?: number;
};

export type Sitemap = Array<SitemapEntry>;
