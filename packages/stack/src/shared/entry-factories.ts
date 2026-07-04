import {
	type DehydrateOptions,
	type QueryClient,
	defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import type { ComponentType } from "react";

/**
 * Minimal structural view of a route returned by
 * `createStackClient(...).router.getRoute(path)`. The framework entry
 * factories only need these three fields.
 */
export interface StackRouteLike {
	PageComponent?: ComponentType<any> | undefined;
	loader?: ((...args: any[]) => unknown) | undefined;
	meta?: ((...args: any[]) => any) | undefined;
}

/**
 * Minimal structural view of the object returned by `createStackClient`.
 * Any concrete `ClientLib<TRoutes>` is assignable to this shape.
 */
export interface StackClientLike {
	router: {
		getRoute: (
			path: string,
			queryParams?: Record<string, string | string[]>,
		) => (StackRouteLike & Record<string, any>) | null | undefined;
	};
}

/**
 * Consumer-provided factory that returns the stack client for a given
 * QueryClient (per-request on the server, singleton on the client).
 */
export type GetStackClient = (queryClient: QueryClient) => StackClientLike;

/**
 * A framework-agnostic BTST API handler, as returned by
 * `createBackendHandler(...).handler`.
 */
export type StackRequestHandler = (
	request: Request,
) => Response | Promise<Response>;

/**
 * Dehydration config owned by the page factories: dehydrate everything the
 * default would, plus failed queries, so the client does not refetch (and
 * flash a loading state) for queries that errored during SSR — regardless of
 * how the consumer configured their QueryClient.
 */
export const stackDehydrateOptions: DehydrateOptions = {
	shouldDehydrateQuery: (query) =>
		defaultShouldDehydrateQuery(query) || query.state.status === "error",
};
