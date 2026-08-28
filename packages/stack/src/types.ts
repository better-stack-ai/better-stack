import type { Route, createRouter } from "@btst/yar";
import type {
	DBAdapter as Adapter,
	DatabaseDefinition,
	DbPlugin,
} from "@btst/db";
import type { Endpoint, Router } from "better-call";
import type { ServerAuth } from "./authorization/server";
import type {
	OperationApi,
	OperationPermissionRequest,
	OperationRecord,
	RouteOperationApi,
} from "./plugins/api/operation";
import type {
	ComposedEndpointInventoryEntry,
	InfrastructureRouteInventory,
} from "./plugins/api/endpoint-inventory";
import type {
	AnyAuthorization,
	AuthorizationPermissionRequest,
} from "./authorization";

export type {
	StackClientAuth,
	StackIdentity,
} from "./shared/auth-types";

/**
 * Context passed to backend plugins during route creation
 * Provides access to all registered plugins for introspection (used by openAPI plugin)
 */
export interface StackContext {
	/** All registered backend plugins */
	plugins: Record<string, BackendPlugin<any, any, any>>;
	/** The API base path (e.g., "/api/data") */
	basePath: string;
	/** The database adapter */
	adapter: Adapter;
	/** The server-side auth provider, when configured on `createBackendStack()` */
	auth?: ServerAuth<AnyAuthorization>;
	/** Routes already constructed for each plugin, used by introspection plugins. */
	pluginRoutes: Record<string, Record<string, Endpoint>>;
	/** Validated, safe metadata for every operation-first/infrastructure route. */
	readonly endpointInventory?: readonly ComposedEndpointInventoryEntry[];
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
 * BTST composes all plugin schemas together at runtime using Better DB's .use() method.
 * You can optionally provide a base schema via the dbSchema config option.
 *
 * @template TRoutes - The exact shape of routes this plugin provides (preserves keys and endpoint types)
 * @template TApi - The shape of the server-side API surface exposed via `createBackendStack().api`.
 *   Defaults to `never` so that plugins without an `api` factory are excluded from the
 *   `createBackendStack().api` namespace entirely, preventing accidental access of `undefined` at runtime.
 */
export interface BackendPlugin<
	TRoutes extends Record<string, Endpoint> = Record<string, Endpoint>,
	TApi extends Record<string, (...args: any[]) => any> = never,
	TOperations extends OperationRecord = never,
> {
	name: string;

	/**
	 * Create API endpoints for this plugin
	 * Returns an object with named endpoints that will be composed into the router
	 *
	 * @param adapter - Better DB adapter instance with methods:
	 *   create, update, updateMany, delete, deleteMany, findOne, findMany, count
	 * @param context - Stack context with access to all plugins (for introspection)
	 * @param operations - Request-bound operations declared by this plugin. When
	 *   the plugin declares operations, create every business endpoint with an
	 *   `operations.operationKey.route(ctx => input)` handler.
	 */
	routes(
		adapter: Adapter,
		context: StackContext | undefined,
		operations: [TOperations] extends [never]
			? Record<string, never>
			: RouteOperationApi<TOperations>,
	): TRoutes;
	dbPlugin: DbPlugin;

	/**
	 * Optional factory that returns server-side getter functions bound to the adapter.
	 * The returned object is merged into `createBackendStack().api.<pluginName>.*` for direct
	 * server-side or SSG data access without going through HTTP.
	 *
	 * @param adapter - The adapter instance shared with `routes`
	 */
	api?: (adapter: Adapter) => TApi;

	/**
	 * Define operations shared by HTTP, request-scoped, and internal calls.
	 * When present, every composed route must resolve to a same-key operation,
	 * an explicit operationRouteMap entry, or an infrastructure declaration.
	 */
	operations?: (adapter: Adapter, context?: StackContext) => TOperations;

	/**
	 * Explicit declarations for true infrastructure routes that cannot use a
	 * business operation. When present, all other routes must have same-key
	 * operations and stale declarations fail stack composition.
	 */
	infrastructureRoutes?: InfrastructureRouteInventory;
	/** Explicit route-key to operation-key mapping when their public names differ. */
	operationRouteMap?: Readonly<Record<string, string>>;
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
 * Utility type that maps each plugin key to the return type of its `api` factory.
 * Plugin keys whose `TApi` resolves to `never` (i.e. plugins with no `api` factory)
 * are excluded from the resulting type via key remapping, preventing TypeScript from
 * suggesting callable functions on what is actually `undefined` at runtime.
 */
export type PluginApis<
	TPlugins extends Record<string, BackendPlugin<any, any, any>>,
> = {
	[K in keyof TPlugins as _ApiOf<TPlugins[K]> extends never
		? never
		: K]: _ApiOf<TPlugins[K]>;
};

/** @internal Extract the TApi parameter from a BackendPlugin type. */
type _ApiOf<T> = T extends BackendPlugin<
	infer _TRoutes,
	infer TApi,
	infer _TOps
>
	? TApi
	: never;

type _OperationsOf<T> = T extends BackendPlugin<
	infer _TRoutes,
	infer _TApi,
	infer TOperations
>
	? TOperations
	: never;

/** Bound operation APIs, keyed by their registered backend plugin names. */
export type PluginOperations<
	TPlugins extends Record<string, BackendPlugin<any, any, any>>,
> = {
	[K in keyof TPlugins as _OperationsOf<TPlugins[K]> extends never
		? never
		: K]: OperationApi<_OperationsOf<TPlugins[K]>>;
};

type _OperationPermissionRequests<T> = T extends OperationRecord
	? OperationPermissionRequest<T[keyof T]>
	: never;

/** Permission requests required by all operations in a plugin map. */
export type PluginOperationPermissionRequests<
	TPlugins extends Record<string, BackendPlugin<any, any, any>>,
> = {
	[K in keyof TPlugins]: _OperationPermissionRequests<
		_OperationsOf<TPlugins[K]>
	>;
}[keyof TPlugins];

type _RequestWithId<TRequest, TId> = TRequest extends { readonly id: TId }
	? TRequest
	: never;

type _RequestFacts<TRequest> = TRequest extends { readonly facts: infer TFacts }
	? TFacts
	: never;

type _IncompatibleOperationRequests<TOperationRequest, TAuthorizationRequest> =
	TOperationRequest extends { readonly id: infer TId }
		? _RequestWithId<TAuthorizationRequest, TId> extends infer TRegistered
			? [TRegistered] extends [never]
				? TOperationRequest
				: [_RequestFacts<TOperationRequest>] extends [
							_RequestFacts<TRegistered>,
						]
					? [_RequestFacts<TRegistered>] extends [
							_RequestFacts<TOperationRequest>,
						]
						? never
						: TOperationRequest
					: TOperationRequest
			: TOperationRequest
		: TOperationRequest;

/**
 * Reject server adapters whose registered catalogs do not cover every
 * operation descriptor in the composed stack.
 */
export type CompatibleStackAuth<
	TPlugins extends Record<string, BackendPlugin<any, any, any>>,
	TAuth extends ServerAuth<AnyAuthorization> | undefined,
> = TAuth extends ServerAuth<infer TAuthorization extends AnyAuthorization>
	? _IncompatibleOperationRequests<
			PluginOperationPermissionRequests<TPlugins>,
			AuthorizationPermissionRequest<TAuthorization>
		> extends never
		? TAuth
		: never
	: TAuth;

/**
 * Configuration for creating the backend stack
 */
export interface BackendStackConfig<
	TPlugins extends Record<string, BackendPlugin<any, any, any>> = Record<
		string,
		BackendPlugin<any, any, any>
	>,
	TAuth extends ServerAuth<AnyAuthorization> | undefined =
		| ServerAuth<AnyAuthorization>
		| undefined,
> {
	basePath: string;
	dbSchema?: DatabaseDefinition;
	plugins: TPlugins;
	adapter: (db: DatabaseDefinition) => Adapter;
	/**
	 * Server authorization created by `createServerAuth()`. When set,
	 * request operations evaluate their schema-backed permission after trusted
	 * facts are derived. When omitted, request operations remain permissive;
	 * use `internal` to make trusted intent explicit.
	 */
	auth?: TAuth;
}

/**
 * @deprecated Use `BackendStackConfig`. This alias is removed by #225.
 */
export type BackendLibConfig<
	TPlugins extends Record<string, BackendPlugin<any, any, any>> = Record<
		string,
		BackendPlugin<any, any, any>
	>,
	TAuth extends ServerAuth<AnyAuthorization> | undefined =
		| ServerAuth<AnyAuthorization>
		| undefined,
> = BackendStackConfig<TPlugins, TAuth>;

/**
 * Configuration for creating the client stack
 */
export interface ClientStackConfig<
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
 * @deprecated Use `ClientStackConfig`. This alias is removed by #225.
 */
export type ClientLibConfig<
	TPlugins extends Record<string, ClientPlugin<any, any>> = Record<
		string,
		ClientPlugin<any, any>
	>,
> = ClientStackConfig<TPlugins>;

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
 * Type for the pluginOverrides prop in StackContext
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
	TPlugins extends Record<string, BackendPlugin<any, any, any>>,
> = UnionToIntersection<
	{
		[PluginKey in keyof TPlugins]: TPlugins[PluginKey] extends BackendPlugin<
			infer TRoutes,
			any,
			any
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
 * Result of creating the backend stack
 */
export interface BackendStack<
	TRoutes extends Record<string, Endpoint> = Record<string, Endpoint>,
	TApis extends Record<
		string,
		Record<string, (...args: any[]) => any>
	> = Record<string, Record<string, (...args: any[]) => any>>,
	TOperations extends Record<
		string,
		Record<string, (...args: any[]) => any>
	> = Record<string, Record<string, (...args: any[]) => any>>,
> {
	handler: (request: Request) => Promise<Response>; // API route handler
	router: Router; // Better-call router
	dbSchema: DatabaseDefinition; // Better-db schema
	/** The database adapter shared across all plugins */
	adapter: Adapter;
	/** Fully-typed server-side getter functions, namespaced per plugin */
	api: TApis;
	/** User/request-scoped operations with automatic authorization. */
	forRequest: (request: Request) => { api: TOperations };
	/** Trusted operations that retain validation and lifecycle hooks. */
	internal: TOperations;
}

/**
 * @deprecated Use `BackendStack`. This alias is removed by #225.
 */
export type BackendLib<
	TRoutes extends Record<string, Endpoint> = Record<string, Endpoint>,
	TApis extends Record<
		string,
		Record<string, (...args: any[]) => any>
	> = Record<string, Record<string, (...args: any[]) => any>>,
	TOperations extends Record<
		string,
		Record<string, (...args: any[]) => any>
	> = Record<string, Record<string, (...args: any[]) => any>>,
> = BackendStack<TRoutes, TApis, TOperations>;

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
 * Result of creating the client stack
 */
export interface ClientStack<
	TRoutes extends Record<string, Route> = Record<string, Route>,
> {
	router: ReturnType<typeof createRouter<TRoutes, {}>>;
	generateSitemap: () => Promise<Sitemap>;
}

/**
 * @deprecated Use `ClientStack`. This alias is removed by #225.
 */
export type ClientLib<
	TRoutes extends Record<string, Route> = Record<string, Route>,
> = ClientStack<TRoutes>;

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
