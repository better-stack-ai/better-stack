import { createRouter } from "better-call";
import type {
	BackendLibConfig,
	BackendLib,
	PrefixedPluginRoutes,
	PluginApis,
	StackContext,
} from "../types";
import type {
	StackIdentity,
	StackServerAuthProvider,
} from "../shared/auth-types";
import { defineDb } from "@btst/db";

export { toNodeHandler } from "better-call/node";

/**
 * Lazy, memoized identity resolvers keyed by the request's `Headers`
 * instance. better-call passes the same `Headers` object from the incoming
 * `Request` into every endpoint context, so lifecycle hooks can look the
 * identity up via `getRequestIdentity(ctx.headers)`. Entries are
 * garbage-collected with the request.
 */
const identityResolvers = new WeakMap<
	Headers,
	() => Promise<StackIdentity | null>
>();

function registerIdentityResolver(
	request: Request,
	auth: StackServerAuthProvider,
): void {
	let cached: Promise<StackIdentity | null> | undefined;
	identityResolvers.set(request.headers, () => {
		cached ??= Promise.resolve(
			auth.getIdentity({ headers: request.headers, request }),
		).then((identity) => identity ?? null);
		return cached;
	});
}

/**
 * Returns the identity of the request that carried these headers, as resolved
 * by the `auth` provider configured on `stack()`.
 *
 * The provider's `getIdentity` runs at most once per request (memoized), no
 * matter how many hooks call this. Returns `null` when no auth provider is
 * configured, when called outside a request handled by `stack().handler`, or
 * when the user is unauthenticated.
 *
 * @example
 * ```ts
 * import { getRequestIdentity } from "@btst/stack/api";
 *
 * const blogBackend = blogBackendPlugin({
 *   hooks: {
 *     onBeforeCreatePost: async (data, ctx) => {
 *       const identity = await getRequestIdentity(ctx.headers);
 *       if (!identity) throw new Error("Unauthorized");
 *     },
 *   },
 * });
 * ```
 */
export async function getRequestIdentity(
	// Optional because better-call types endpoint `ctx.headers` as optional.
	headers: Headers | undefined,
): Promise<StackIdentity | null> {
	const resolve = headers ? identityResolvers.get(headers) : undefined;
	return resolve ? resolve() : null;
}

/**
 * Creates the backend library with plugin support
 *
 * @example
 * ```ts
 * const api = stack({
 *   plugins: {
 *     messages: messagesPlugin.backend
 *   },
 *   adapter: memoryAdapter
 * });
 *
 * // Use in API route:
 * export const GET = api.handler;
 * export const POST = api.handler;
 * ```
 *
 * @template TPlugins - The exact plugins map (inferred from config)
 * @template TRoutes - All routes with prefixed keys like "pluginName_routeName" (computed automatically)
 */
export function stack<
	TPlugins extends Record<string, any>,
	TRoutes extends
		PrefixedPluginRoutes<TPlugins> = PrefixedPluginRoutes<TPlugins>,
>(
	config: BackendLibConfig<TPlugins>,
): BackendLib<TRoutes, PluginApis<TPlugins>> {
	const { plugins, adapter, dbSchema, basePath, auth } = config;

	// Collect all routes from all plugins with type-safe prefixed keys
	const allRoutes = {} as TRoutes;

	let betterDbSchema = dbSchema ?? defineDb({});

	// use all the db plugins on the betterDbSchema
	for (const [pluginKey, plugin] of Object.entries(plugins)) {
		betterDbSchema = betterDbSchema.use(plugin.dbPlugin);
	}

	// Create the adapter instance once
	const adapterInstance = adapter(betterDbSchema);

	// Create context for plugins that need access to all plugins (e.g., openAPI)
	const context: StackContext = {
		plugins,
		basePath,
		adapter: adapterInstance,
		auth,
	};

	for (const [pluginKey, plugin] of Object.entries(plugins)) {
		// Pass both adapter and context to plugin routes
		const pluginRoutes = plugin.routes(adapterInstance, context);

		// Prefix route keys with plugin name to avoid collisions
		for (const [routeKey, endpoint] of Object.entries(pluginRoutes)) {
			const compositeKey = `${pluginKey}_${routeKey}` as keyof TRoutes;
			(allRoutes as any)[compositeKey] = endpoint;
		}
	}

	// Build the typed api surface by calling each plugin's api factory
	const pluginApis = {} as PluginApis<TPlugins>;
	for (const [pluginKey, plugin] of Object.entries(plugins)) {
		if (plugin.api) {
			(pluginApis as any)[pluginKey] = plugin.api(adapterInstance);
		}
	}

	// Create the composed router
	const router = createRouter(allRoutes, {
		basePath: basePath,
	});

	// With an auth provider, register a per-request identity resolver before
	// dispatch so hooks can call getRequestIdentity(ctx.headers). Without one,
	// the handler is returned untouched.
	const handler = auth
		? (request: Request) => {
				registerIdentityResolver(request, auth);
				return router.handler(request);
			}
		: router.handler;

	return {
		handler,
		router,
		dbSchema: betterDbSchema,
		adapter: adapterInstance,
		api: pluginApis,
	};
}

export type {
	BackendPlugin,
	BackendLibConfig,
	BackendLib,
	PluginApis,
	StackContext,
} from "../types";

export type {
	CanParams,
	StackIdentity,
	StackServerAuthProvider,
} from "../shared/auth-types";
