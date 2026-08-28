import { createRouter } from "better-call";
import type {
	BackendLibConfig,
	BackendLib,
	PrefixedPluginRoutes,
	PluginApis,
	PluginOperations,
	StackContext,
	BackendPlugin,
	CompatibleStackAuth,
} from "../types";
import type {
	StackIdentity,
	StackServerAuthProvider,
} from "../shared/auth-types";
import { defineDb } from "@btst/db";
import { AuthorizationError } from "../authorization/server";
import {
	bindRouteOperationHandler,
	isOperationInputValidationError,
	OperationHttpError,
	runAuthorizedOperation,
	runInternalOperation,
	type AnyOperation,
	type RouteOperation,
} from "../plugins/api/operation";
import {
	composeEndpointInventory,
	type ComposedEndpointInventoryEntry,
} from "../plugins/api/endpoint-inventory";
import { serializeValidationIssues } from "../plugins/api/create-endpoint";

export { toNodeHandler } from "better-call/node";

function throwHttpOperationError(
	cause: unknown,
	error: (...args: any[]) => Error,
): never {
	if (isOperationInputValidationError(cause)) {
		throw error(400, {
			message: cause.message,
			code: "VALIDATION_ERROR",
			issues: serializeValidationIssues(cause.issues),
		});
	}
	if (
		cause instanceof AuthorizationError ||
		cause instanceof OperationHttpError
	) {
		const candidate = cause;
		if (
			typeof candidate.statusCode === "number" &&
			Number.isInteger(candidate.statusCode) &&
			candidate.statusCode >= 400 &&
			candidate.statusCode <= 599 &&
			typeof candidate.code === "string"
		) {
			throw error(candidate.statusCode, {
				message: candidate.message,
				code: candidate.code,
				...(candidate instanceof OperationHttpError &&
				Array.isArray(candidate.issues)
					? { issues: candidate.issues }
					: {}),
			});
		}
	}
	throw cause;
}

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
		// Mirror the client-side StackAuthBoundary: a failing getIdentity is
		// treated as unauthenticated (null) rather than rejecting, so hooks
		// written without try/catch can't fail the whole request.
		cached ??= Promise.resolve()
			.then(() => auth.getIdentity({ headers: request.headers, request }))
			.then((identity) => identity ?? null)
			.catch((error) => {
				console.error("[btst/auth] getIdentity() failed:", error);
				return null;
			});
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
	const TPlugins extends Record<string, BackendPlugin<any, any, any>>,
	const TAuth extends StackServerAuthProvider | undefined,
	TRoutes extends
		PrefixedPluginRoutes<TPlugins> = PrefixedPluginRoutes<TPlugins>,
>(
	config: BackendLibConfig<TPlugins, TAuth> & {
		auth?: CompatibleStackAuth<TPlugins, TAuth>;
	},
): BackendLib<TRoutes, PluginApis<TPlugins>, PluginOperations<TPlugins>> {
	const { plugins, adapter, dbSchema, basePath } = config;
	const runtimeAuth = (config as unknown as { auth?: StackServerAuthProvider })
		.auth;

	// Collect all routes from all plugins with type-safe prefixed keys
	const allRoutes = {} as TRoutes;

	let betterDbSchema = dbSchema ?? defineDb({});

	// use all the db plugins on the betterDbSchema
	for (const [pluginKey, plugin] of Object.entries(plugins)) {
		betterDbSchema = betterDbSchema.use(plugin.dbPlugin);
	}

	// Create the adapter instance once
	const adapterInstance = adapter(betterDbSchema);

	// Keep the constructed route maps on the shared context so introspection
	// plugins inspect the real routes instead of invoking factories a second time.
	const pluginRoutesByName: Record<string, Record<string, any>> = {};

	// Create context for plugins that need access to all plugins (e.g., openAPI)
	const pluginOperations: Record<string, Record<string, any>> = {};
	const endpointInventory: ComposedEndpointInventoryEntry[] = [];
	const context: StackContext = {
		plugins,
		basePath,
		adapter: adapterInstance,
		auth: runtimeAuth,
		pluginRoutes: pluginRoutesByName,
	};

	for (const [pluginKey, plugin] of Object.entries(plugins)) {
		if (plugin.operations) {
			pluginOperations[pluginKey] = plugin.operations(adapterInstance, context);
		}
	}

	const routeOperationApis: Record<
		string,
		Record<string, RouteOperation<AnyOperation>>
	> = {};
	for (const [pluginKey, operations] of Object.entries(pluginOperations)) {
		routeOperationApis[pluginKey] = {};
		for (const [operationKey, operation] of Object.entries(operations)) {
			const invoke = (input: unknown, request: Request) =>
				runAuthorizedOperation(operation, input, {
					request,
					...(runtimeAuth ? { auth: runtimeAuth } : {}),
					resolveIdentity: () => getRequestIdentity(request.headers),
				});
			Object.defineProperty(invoke, "route", {
				value: (resolveInput: (context: any) => unknown) => {
					const handler = async (context: {
						request: Request;
						error: (...args: any[]) => Error;
					}) => {
						try {
							const input = await resolveInput(context);
							return await invoke(input, context.request);
						} catch (cause) {
							throwHttpOperationError(cause, context.error);
						}
					};
					return bindRouteOperationHandler(handler, {
						pluginKey,
						operationKey,
						operation,
					});
				},
			});
			routeOperationApis[pluginKey]![operationKey] =
				invoke as RouteOperation<AnyOperation>;
		}
	}

	for (const [pluginKey, plugin] of Object.entries(plugins)) {
		// Pass both adapter and context to plugin routes
		const pluginRoutes = plugin.routes(
			adapterInstance,
			context,
			routeOperationApis[pluginKey] ?? {},
		);
		pluginRoutesByName[pluginKey] = pluginRoutes;
		endpointInventory.push(
			...composeEndpointInventory(
				pluginKey,
				plugin.name,
				pluginRoutes,
				pluginOperations[pluginKey] ?? {},
				plugin.operations !== undefined,
				plugin.infrastructureRoutes,
				plugin.operationRouteMap,
			),
		);

		// Prefix route keys with plugin name to avoid collisions
		for (const [routeKey, endpoint] of Object.entries(pluginRoutes)) {
			const compositeKey = `${pluginKey}_${routeKey}` as keyof TRoutes;
			(allRoutes as any)[compositeKey] = endpoint;
		}
	}
	Object.defineProperty(context, "endpointInventory", {
		value: Object.freeze(endpointInventory),
		enumerable: true,
	});

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
		openapi: { disabled: true },
	});

	// With an auth provider, register a per-request identity resolver before
	// dispatch so hooks can call getRequestIdentity(ctx.headers). Without one,
	// the handler is returned untouched.
	const handler = runtimeAuth
		? (request: Request) => {
				registerIdentityResolver(request, runtimeAuth);
				return router.handler(request);
			}
		: router.handler;

	const createRequestOperationApi = (request: Request) => {
		const result: Record<
			string,
			Record<string, (input: unknown) => unknown>
		> = {};
		for (const [pluginKey, operations] of Object.entries(pluginOperations)) {
			result[pluginKey] = {};
			for (const [operationKey, operation] of Object.entries(operations)) {
				result[pluginKey]![operationKey] = (input: unknown) =>
					runAuthorizedOperation(operation, input, {
						request,
						...(runtimeAuth ? { auth: runtimeAuth } : {}),
						resolveIdentity: () => getRequestIdentity(request.headers),
					});
			}
		}
		return result;
	};

	const internalResult: Record<
		string,
		Record<string, (input: unknown) => unknown>
	> = {};
	for (const [pluginKey, operations] of Object.entries(pluginOperations)) {
		internalResult[pluginKey] = {};
		for (const [operationKey, operation] of Object.entries(operations)) {
			internalResult[pluginKey]![operationKey] = (input: unknown) =>
				runInternalOperation(operation, input);
		}
	}
	const internal = internalResult as PluginOperations<TPlugins>;

	return {
		handler,
		router,
		dbSchema: betterDbSchema,
		adapter: adapterInstance,
		api: pluginApis,
		internal,
		forRequest: (request: Request) => {
			if (runtimeAuth) registerIdentityResolver(request, runtimeAuth);
			return {
				api: createRequestOperationApi(request) as PluginOperations<TPlugins>,
			};
		},
	};
}

export type {
	BackendPlugin,
	BackendLibConfig,
	BackendLib,
	PluginApis,
	PluginOperations,
	StackContext,
} from "../types";

export type {
	CanParams,
	StackIdentity,
	StackServerAuthProvider,
} from "../shared/auth-types";
