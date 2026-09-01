/**
 * Plugin utilities and types for building standalone plugins
 *
 * This module exports everything needed to create custom plugins
 * for BTST outside of this package.
 *
 * Note: Backend and Client plugins are separate to prevent SSR issues
 * and enable better code splitting. Import them separately:
 * - Backend: import type { BackendPlugin } from "@btst/stack/plugins/api"
 * - Client: import type { ClientPlugin } from "@btst/stack/plugins/client"
 */

import type { ClientPluginDefinition } from "../../types";
import type { Route } from "@btst/yar";

type IdentifiedClientPluginDefinition<
	TId extends string,
	TOverrides,
	TRoutes extends Record<string, Route>,
	TProviderConfig extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, never>
	>,
	TApiRuntimeFrom extends string = never,
> = ClientPluginDefinition<
	TOverrides,
	TRoutes,
	TId,
	TProviderConfig,
	TApiRuntimeFrom
> &
	([TApiRuntimeFrom] extends [never]
		? unknown
		: { readonly apiRuntimeFrom: TApiRuntimeFrom });

interface DefineClientPluginWithOverrides<TOverrides> {
	<
		const TId extends string,
		TRoutes extends Record<string, Route>,
		const TProviderConfig extends Readonly<Record<string, unknown>> = Readonly<
			Record<string, never>
		>,
		const TApiRuntimeFrom extends string = never,
	>(
		plugin: IdentifiedClientPluginDefinition<
			TId,
			TOverrides,
			TRoutes,
			TProviderConfig,
			TApiRuntimeFrom
		>,
	): IdentifiedClientPluginDefinition<
		TId,
		TOverrides,
		TRoutes,
		TProviderConfig,
		TApiRuntimeFrom
	>;
}

export type {
	ClientPlugin,
	ClientPluginDefinition,
	ClientPluginRegistration,
	PluginOverrides,
	ResolvedClientPluginRuntime,
} from "../../types";

export {
	createApiClient,
	createSanitizedSSRLoaderError,
	isConnectionError,
	SSR_LOADER_ERROR_MESSAGE,
} from "../utils";

// Shared error contract + React Query config for data plugins
export {
	isErrorResponse,
	SHARED_QUERY_CONFIG,
	toError,
} from "./resource/errors";
export type { StackError } from "./resource/errors";

// Resource declaration types + server-safe query-key factory
export {
	buildQueryKey,
	createResourceQueryKeys,
	resolvePageSize,
	runResourceMutation,
	runResourceQuery,
} from "./resource/queries";
export type {
	ResourceClient,
	ResourceDef,
	ResourceMutationDef,
	ResourceMutationResult,
	ResourceMutationVars,
	ResourceQueryArgs,
	ResourceQueryData,
	ResourceQueryDef,
	ResourceQueryEntry,
	ResourceQueryKeys,
	ResourcesDeclaration,
} from "./resource/queries";

// Re-export Yar types needed for plugins
export type { Route, RouteContext, RouteDef } from "@btst/yar";
export {
	createRoute,
	createRouter,
	defineRoute,
	defineRoutes,
} from "@btst/yar";

export { createClient } from "better-call/client";

/**
 * Helper to define a client plugin with full type inference
 *
 * Automatically infers route keys, hook names, and their types without needing casts.
 *
 * @example
 * ```ts
 * const messagesPlugin = defineClientPlugin({
 *   id: "messages",
 *   resolve: (runtime) => ({
 *     routes: () => ({
 *       messagesList: createRoute("/messages", () => ({ ... }))
 *     }),
 *     sitemap: () => [{
 *       url: `${runtime.site.baseURL}${runtime.site.basePath}/messages`,
 *     }],
 *   }),
 * });
 * ```
 *
 * @template TOverrides - The shape of overridable components/functions this plugin requires
 * @template TRoutes - The exact shape of routes this plugin provides (preserves keys and route types)
 */
export function defineClientPlugin<
	TOverrides,
>(): DefineClientPluginWithOverrides<TOverrides>;
export function defineClientPlugin<
	const TId extends string,
	TRoutes extends Record<string, Route>,
	const TProviderConfig extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, never>
	>,
	const TApiRuntimeFrom extends string = never,
>(
	plugin: IdentifiedClientPluginDefinition<
		TId,
		Record<string, never>,
		TRoutes,
		TProviderConfig,
		TApiRuntimeFrom
	>,
): IdentifiedClientPluginDefinition<
	TId,
	Record<string, never>,
	TRoutes,
	TProviderConfig,
	TApiRuntimeFrom
>;
export function defineClientPlugin<
	TOverrides = Record<string, never>,
	TRoutes extends Record<string, Route> = Record<string, Route>,
	TProviderConfig extends Readonly<Record<string, unknown>> = Readonly<
		Record<string, unknown>
	>,
	TApiRuntimeFrom extends string = never,
>(
	plugin: ClientPluginDefinition<
		TOverrides,
		TRoutes,
		string,
		TProviderConfig,
		TApiRuntimeFrom
	>,
): ClientPluginDefinition<
	TOverrides,
	TRoutes,
	string,
	TProviderConfig,
	TApiRuntimeFrom
>;
export function defineClientPlugin(
	plugin?: ClientPluginDefinition<any, any, any, any, any>,
):
	| ClientPluginDefinition<any, any, any, any, any>
	| DefineClientPluginWithOverrides<any> {
	if (plugin === undefined) {
		return ((definition: any) =>
			definition) as DefineClientPluginWithOverrides<any>;
	}
	return plugin;
}
