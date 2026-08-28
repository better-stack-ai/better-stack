import type { Route, createRouter } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
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

/** An absolute origin plus the path mounted below that origin. */
export interface ClientLocation {
	/** Absolute HTTP(S) origin, without a pathname. */
	baseURL: string;
	/** Mount path below the origin, normalized with a leading slash. */
	basePath: string;
}

/** Shared API transport configured once for a request or browser stack. */
export interface ClientApiConfig extends ClientLocation {
	/**
	 * Per-request server headers. Browser-created stacks reject this field so a
	 * request cookie or authorization value cannot enter the provider projection.
	 */
	headers?: HeadersInit;
}

/** A same-origin endpoint replacement that inherits the configured origin. */
export interface ClientPathEndpointOverride {
	/** Replacement path on the inherited top-level origin. */
	basePath: string;
	/** A path-only replacement cannot partially replace the origin. */
	baseURL?: never;
}

/** A complete endpoint replacement. A new origin never inherits only a path. */
export interface ClientAbsoluteEndpointOverride extends ClientLocation {}

/** A location override must replace a path, or an origin and path together. */
export type ClientLocationOverride =
	| ClientPathEndpointOverride
	| ClientAbsoluteEndpointOverride;

/**
 * Per-plugin API replacement. Headers and credentials declared here are
 * deliberately browser-safe and are the only transport additions projected to
 * the provider. Server request headers are resolved independently.
 */
export type ClientApiEndpointOverride = ClientLocationOverride & {
	/** Explicit browser-safe headers used in both server and browser transports. */
	browserHeaders?: HeadersInit;
	/** Explicit browser Fetch credentials behavior for this endpoint. */
	credentials?: RequestCredentials;
};

/**
 * Stack-owned endpoint replacements for one registered client plugin. An empty
 * object inherits both top-level locations unchanged.
 */
export interface ClientPluginEndpointOverride {
	/** Optional replacement for the plugin's BTST API endpoint. */
	api?: ClientApiEndpointOverride;
	/** Optional replacement for the plugin's rendered/public site location. */
	site?: ClientLocationOverride;
}

/** Effective API transport captured by a resolved plugin definition. */
export interface ResolvedClientApi extends ClientLocation {
	/** Effective request headers for this stack instance. Never provider-facing. */
	headers?: Headers;
	/** Explicit browser-safe cross-origin credentials behavior. */
	credentials?: RequestCredentials;
}

/** Shared runtime supplied when a client plugin definition is expanded. */
export interface ResolvedClientPluginRuntime<TId extends string = string> {
	/** Stable programmatic identifier bound by client-stack registration. */
	id: TId;
	/** Effective API endpoint and request-specific transport values. */
	api: ResolvedClientApi;
	/** Effective public site location for routes, metadata, and sitemap output. */
	site: ClientLocation;
	/** The one React Query client shared by every client-stack consumer. */
	queryClient: QueryClient;
}

/** Provider-safe API transport; it can contain only explicitly public headers. */
export interface ClientProviderApi extends ClientLocation {
	/** Explicit browser-safe endpoint headers; never server request headers. */
	browserHeaders?: Headers;
	/** Explicit browser Fetch credentials behavior for this endpoint. */
	credentials?: RequestCredentials;
}

/** Provider-safe endpoint view for one registered plugin. */
export interface ClientProviderPluginRuntime<TId extends string = string> {
	/** Stable programmatic identifier bound by client-stack registration. */
	id: TId;
	/** Provider-safe effective API endpoint for this plugin. */
	api: ClientProviderApi;
	/** Effective site location for this plugin. */
	site: ClientLocation;
}

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
 * @template TRaw - The shape of the lower-level server surface exposed via `createBackendStack().raw`.
 *   Defaults to `never` so that plugins without a `raw` factory are excluded from the
 *   `createBackendStack().raw` namespace entirely, preventing accidental access of `undefined` at runtime.
 */
export interface BackendPlugin<
	TRoutes extends Record<string, Endpoint> = Record<string, Endpoint>,
	TRaw extends Record<string, (...args: any[]) => any> = never,
	TOperations extends OperationRecord = never,
	TId extends string = string,
> {
	/** Canonical stable programmatic identifier. */
	readonly id?: TId;
	/** @deprecated Use `id`. Retained only while first-party plugins migrate. */
	name?: string;

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
	 * Optional factory that returns narrow lower-level helpers bound to the adapter.
	 * The returned object is merged into `createBackendStack().raw.<pluginName>.*` for deliberate
	 * lower-level or SSG data access without authorization or lifecycle composition.
	 *
	 * @param adapter - The adapter instance shared with `routes`
	 */
	raw?: (adapter: Adapter) => TRaw;

	/**
	 * Define operations shared by HTTP, request-scoped, and trusted calls.
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
	TId extends string = string,
> {
	/** Canonical stable programmatic identifier. */
	readonly id?: TId;
	/** @deprecated Use `id`. Retained only while first-party plugins migrate. */
	name?: string;

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
 * Runtime-independent client plugin definition. The definition remains safe to
 * import on the server and is expanded against one resolved stack runtime.
 */
export interface ClientPluginDefinition<
	TOverrides = Record<string, never>,
	TRoutes extends Record<string, Route> = Record<string, Route>,
	TId extends string = string,
> {
	/** Canonical stable programmatic identifier. */
	readonly id?: TId;
	/** @deprecated Use `id`. Retained only while first-party plugins migrate. */
	name?: string;
	/** Expand plugin-specific options against one resolved stack runtime. */
	resolve: (
		runtime: ResolvedClientPluginRuntime<TId>,
	) => Omit<ClientPlugin<TOverrides, TRoutes, TId>, "id" | "name">;
}

/** Canonical definitions plus the temporary already-resolved plugin seam. */
export type ClientPluginRegistration<
	TOverrides = Record<string, never>,
	TRoutes extends Record<string, Route> = Record<string, Route>,
	TId extends string = string,
> =
	| ClientPlugin<TOverrides, TRoutes, TId>
	| ClientPluginDefinition<TOverrides, TRoutes, TId>;

/**
 * Utility type that maps each plugin key to the return type of its `raw` factory.
 * Plugin keys whose `TRaw` resolves to `never` (i.e. plugins with no `raw` factory)
 * are excluded from the resulting type via key remapping, preventing TypeScript from
 * suggesting callable functions on what is actually `undefined` at runtime.
 */
export type PluginRaw<
	TPlugins extends Record<string, BackendPlugin<any, any, any>>,
> = {
	[K in keyof TPlugins as _RawOf<TPlugins[K]> extends never
		? never
		: K]: _RawOf<TPlugins[K]>;
};

/** @internal Extract the TRaw parameter from a BackendPlugin type. */
type _RawOf<T> = T extends BackendPlugin<
	infer _TRoutes,
	infer TRaw,
	infer _TOps
>
	? TRaw
	: never;

type _OperationsOf<T> = T extends BackendPlugin<
	infer _TRoutes,
	infer _TRaw,
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
	plugins: TPlugins & MatchingPluginRegistrations<TPlugins>;
	adapter: (db: DatabaseDefinition) => Adapter;
	/**
	 * Server authorization created by `createServerAuth()`. When set,
	 * request operations evaluate their schema-backed permission after trusted
	 * facts are derived. When omitted, request operations remain permissive;
	 * use `trusted` to make trusted intent explicit.
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

type AnyClientPluginRegistration = ClientPluginRegistration<any, any, any>;
type LegacyClientPluginMap = Record<string, ClientPlugin<any, any>>;

/** @internal Extract a required canonical plugin ID, excluding legacy optional IDs. */
type _DeclaredPluginId<TPlugin> = TPlugin extends {
	readonly id: infer TId extends string;
}
	? TId
	: never;

/** Reject a registration key that differs from a plugin's declared canonical ID. */
export type MatchingPluginRegistrations<
	TPlugins extends Record<string, unknown>,
> = {
	[K in keyof TPlugins]: [_DeclaredPluginId<TPlugins[K]>] extends [never]
		? TPlugins[K]
		: K extends _DeclaredPluginId<TPlugins[K]>
			? _DeclaredPluginId<TPlugins[K]> extends K
				? TPlugins[K]
				: never
			: never;
};

/** Stack-owned endpoint replacements, limited to registered plugin keys. */
export type ClientPluginEndpointOverrides<
	TPlugins extends Record<string, AnyClientPluginRegistration>,
> = Partial<{ [K in keyof TPlugins]: ClientPluginEndpointOverride }>;

/** Canonical shared runtime configured once for the complete client stack. */
export interface ResolvedClientStackConfig<
	TPlugins extends Record<string, AnyClientPluginRegistration> = Record<
		string,
		AnyClientPluginRegistration
	>,
> {
	/** Shared BTST API endpoint and optional request-specific server headers. */
	api: ClientApiConfig;
	/** Shared location of plugin-rendered public pages. */
	site: ClientLocation;
	/** The one React Query client used by loaders, hydration, and browser hooks. */
	queryClient: QueryClient;
	/** Runtime-independent and temporary already-resolved plugin registrations. */
	plugins: TPlugins & MatchingPluginRegistrations<TPlugins>;
	/** Explicit endpoint replacements keyed by a registered plugin name. */
	endpoints?: ClientPluginEndpointOverrides<TPlugins>;
	/** Shared origins live under `api` or `site`, never an ambiguous top level. */
	baseURL?: never;
	/** Shared paths live under `api` or `site`, never an ambiguous top level. */
	basePath?: never;
}

/**
 * Temporary compatibility shape for already-resolved first-party plugins.
 * Canonical consumers configure `api`, `site`, and `queryClient` instead.
 */
export interface LegacyClientStackConfig<
	TPlugins extends LegacyClientPluginMap = LegacyClientPluginMap,
> {
	/** Temporary already-resolved plugin registrations. */
	plugins: TPlugins;
	/** Temporary route-introspection base path retained during plugin migration. */
	basePath?: string;
	/** Removed ambiguous top-level origin. */
	baseURL?: never;
	/** Canonical runtime configuration is unavailable on the legacy branch. */
	api?: never;
	/** Canonical runtime configuration is unavailable on the legacy branch. */
	site?: never;
	/** Canonical runtime configuration is unavailable on the legacy branch. */
	queryClient?: never;
	/** Endpoint replacements require the canonical resolved runtime. */
	endpoints?: never;
}

/** Configuration for creating either a canonical or compatibility client stack. */
export type ClientStackConfig<
	TPlugins extends Record<
		string,
		AnyClientPluginRegistration
	> = LegacyClientPluginMap,
> =
	| ResolvedClientStackConfig<TPlugins>
	| (TPlugins extends LegacyClientPluginMap
			? LegacyClientStackConfig<TPlugins>
			: never);

/**
 * @deprecated Use `ClientStackConfig`. This alias is removed by #225.
 */
export type ClientLibConfig<
	TPlugins extends Record<
		string,
		AnyClientPluginRegistration
	> = LegacyClientPluginMap,
> = ClientStackConfig<TPlugins>;

/**
 * Utility type to extract override types from plugins
 * Maps plugin names to their override types
 */
export type InferPluginOverrides<
	TPlugins extends Record<string, AnyClientPluginRegistration>,
> = {
	[K in keyof TPlugins]: TPlugins[K] extends ClientPlugin<
		infer TOverrides,
		any,
		any
	>
		? TOverrides
		: TPlugins[K] extends ClientPluginDefinition<infer TOverrides, any, any>
			? TOverrides
			: never;
};

type _HasNoConfigurableOverrides<TOverrides> = [TOverrides] extends [never]
	? true
	: [keyof TOverrides] extends [never]
		? true
		: TOverrides extends Record<string, never>
			? true
			: false;

/**
 * Provider overrides inferred from registered client definitions. Plugins with
 * no configurable fields are omitted rather than requiring empty blocks.
 */
export type InferredPluginOverrides<
	TPlugins extends Record<string, AnyClientPluginRegistration>,
> = keyof _ConfigurablePluginOverrides<TPlugins> extends never
	? Record<string, never>
	: _ConfigurablePluginOverrides<TPlugins>;

type _ConfigurablePluginOverrides<
	TPlugins extends Record<string, AnyClientPluginRegistration>,
> = {
	[K in keyof TPlugins as _HasNoConfigurableOverrides<
		InferPluginOverrides<TPlugins>[K]
	> extends true
		? never
		: K]?: InferPluginOverrides<TPlugins>[K];
};

/**
 * Type for the pluginOverrides prop in StackContext
 * Allows partial overrides per plugin
 */
export type PluginOverrides<
	TPlugins extends Record<string, AnyClientPluginRegistration>,
> = {
	[K in keyof TPlugins]?: Partial<InferPluginOverrides<TPlugins>[K]>;
};

/**
 * Extract all routes from all client plugins, merging them into a single record
 */
export type PluginRoutes<
	TPlugins extends Record<string, AnyClientPluginRegistration>,
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
	TRaw extends Record<string, Record<string, (...args: any[]) => any>> = Record<
		string,
		Record<string, (...args: any[]) => any>
	>,
	TOperations extends Record<
		string,
		Record<string, (...args: any[]) => any>
	> = Record<string, Record<string, (...args: any[]) => any>>,
> {
	handler: (request: Request) => Promise<Response>; // API route handler
	router: Omit<Router, "endpoints"> & { endpoints: TRoutes }; // Better-call router
	dbSchema: DatabaseDefinition; // Better-db schema
	/** The database adapter shared across all plugins */
	adapter: Adapter;
	/** Narrow lower-level/SSG helpers that bypass operation composition. */
	raw: TRaw;
	/** User/request-scoped operations with automatic authorization. */
	forRequest: (request: Request) => { operations: TOperations };
	/** Trusted operations that retain validation and lifecycle hooks. */
	trusted: TOperations;
}

/**
 * @deprecated Use `BackendStack`. This alias is removed by #225.
 */
export type BackendLib<
	TRoutes extends Record<string, Endpoint> = Record<string, Endpoint>,
	TRaw extends Record<string, Record<string, (...args: any[]) => any>> = Record<
		string,
		Record<string, (...args: any[]) => any>
	>,
	TOperations extends Record<
		string,
		Record<string, (...args: any[]) => any>
	> = Record<string, Record<string, (...args: any[]) => any>>,
> = BackendStack<TRoutes, TRaw, TOperations>;

/**
 * Helper type to extract routes from a client plugin
 */
export type ExtractPluginRoutes<T> = T extends ClientPluginRegistration<
	any,
	infer TRoutes
>
	? TRoutes
	: never;

/**
 * Helper type to merge all routes from all plugins into a single record
 */
export type MergeAllPluginRoutes<
	TPlugins extends Record<string, AnyClientPluginRegistration>,
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

declare const resolvedClientStackPlugins: unique symbol;

/** Browser-safe runtime passed to `StackProvider` by the next composition slice. */
export interface ClientProviderProjection<
	TPlugins extends Record<string, AnyClientPluginRegistration> = Record<
		string,
		AnyClientPluginRegistration
	>,
> {
	/** Shared provider-safe API location. Never contains request headers. */
	api: ClientLocation;
	/** Shared provider-safe site location. */
	site: ClientLocation;
	/** The one React Query client supplied to the client stack. */
	queryClient: QueryClient;
	/** Effective provider-safe endpoint values for every registered plugin. */
	plugins: {
		[K in keyof TPlugins]: ClientProviderPluginRuntime<
			[_DeclaredPluginId<TPlugins[K]>] extends [never]
				? K & string
				: _DeclaredPluginId<TPlugins[K]>
		>;
	};
}

/** Canonical client stack with a browser-safe provider projection. */
export interface ResolvedClientStack<
	TRoutes extends Record<string, Route> = Record<string, Route>,
	TPlugins extends Record<string, AnyClientPluginRegistration> = Record<
		string,
		AnyClientPluginRegistration
	>,
> extends ClientStack<TRoutes> {
	/** @internal Type-only registration map used for provider inference. */
	readonly [resolvedClientStackPlugins]?: TPlugins;
	/** Browser-safe projection for provider and browser resource consumers. */
	provider: ClientProviderProjection<TPlugins>;
}

/** Registered plugin definitions carried by a resolved client stack type. */
export type RegisteredClientPlugins<TStack> =
	TStack extends ResolvedClientStack<any, infer TPlugins> ? TPlugins : never;

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
