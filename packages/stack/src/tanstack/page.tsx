import type { QueryClient } from "@tanstack/react-query";
import { notFound, useParams, useRouteContext } from "@tanstack/react-router";
import { useMemo } from "react";
import { normalizePath } from "../client/path-utils";
import { useStackOrNull } from "../context/provider";
import type {
	GetStackClient,
	ResolveStackClient,
} from "../shared/entry-factories";

export interface TanStackPageLoaderArgs<TContext = unknown> {
	/** Parameters for the TanStack catch-all route. */
	params: { _splat?: string };
	/** The current TanStack router context. */
	context: TContext;
}

export interface CreateTanStackPageOptions<TContext = unknown> {
	/** Returns the stack client for a given QueryClient (`lib/stack-client`). */
	getStackClient: GetStackClient;
	/**
	 * Resolves the stack client for the isomorphic route loader. Use an
	 * isomorphic adapter when request-aware setup differs on the server and
	 * client. Defaults to `getStackClient`.
	 */
	getLoaderStackClient?: ResolveStackClient<TanStackPageLoaderArgs<TContext>>;
	/**
	 * Returns the QueryClient for the current context. Defaults to the
	 * `queryClient` from the router context (set up by
	 * `setupRouterSsrQueryIntegration`).
	 */
	getQueryClient?: () => QueryClient;
}

/**
 * Creates the route options for the TanStack Start catch-all page, to spread
 * into `createFileRoute("/pages/$")(...)`: SSR prefetch via `route.loader()`,
 * head/meta from `route.meta()` with loader-before-meta ordering, and 404 via
 * `notFound()`. Query cache dehydration is handled by TanStack's router-query
 * SSR integration.
 *
 * @example
 * ```tsx
 * // src/routes/pages/$.tsx
 * import { createFileRoute } from "@tanstack/react-router";
 * import { createTanStackPageOptions } from "@btst/stack/tanstack";
 * import { getStackClient } from "@/lib/stack-client";
 *
 * export const Route = createFileRoute("/pages/$")(
 *   createTanStackPageOptions({ getStackClient }),
 * );
 * ```
 */
export function createTanStackPageOptions<TContext = unknown>(
	options: CreateTanStackPageOptions<TContext>,
) {
	const { getStackClient, getLoaderStackClient, getQueryClient } = options;

	function resolveQueryClient(context: unknown): QueryClient {
		const fromContext = (context as { queryClient?: QueryClient } | null)
			?.queryClient;
		const queryClient = getQueryClient?.() ?? fromContext;
		if (!queryClient) {
			throw new Error(
				"createTanStackPageOptions: no QueryClient available. Provide `getQueryClient` or add `queryClient` to the router context.",
			);
		}
		return queryClient;
	}

	function PageComponent() {
		const params = useParams({ strict: false }) as { _splat?: string };
		const context = useRouteContext({ strict: false });
		const routePath = normalizePath(params._splat);
		const queryClient = resolveQueryClient(context);
		const providerStack = useStackOrNull()?.resolvedStack;
		// Memoized so PageComponent keeps a stable identity across re-renders:
		// getRoute() invokes the route handler, which produces new component
		// references each call. Without the memo, any router state change that
		// re-renders this component (e.g. a search-param update) would remount
		// the whole page subtree, losing component state such as open dialogs.
		const route = useMemo(
			() =>
				(providerStack ?? getStackClient(queryClient)).router.getRoute(
					routePath,
				),
			[providerStack, queryClient, routePath],
		);
		return route?.PageComponent ? (
			<route.PageComponent />
		) : (
			<div>Route not found</div>
		);
	}

	return {
		ssr: true,
		component: PageComponent,
		loader: async (loaderArgs: TanStackPageLoaderArgs<TContext>) => {
			const { params, context } = loaderArgs;
			const queryClient = resolveQueryClient(context);
			const routePath = normalizePath(params._splat);
			const stackClient = getLoaderStackClient
				? await getLoaderStackClient(queryClient, loaderArgs)
				: getStackClient(queryClient);
			const route = stackClient.router.getRoute(routePath);
			if (!route) throw notFound();
			if (route.loader) await route.loader();
			return { meta: await route.meta?.() };
		},
		head: ({ loaderData }: { loaderData?: { meta?: unknown } }) => {
			if (!loaderData?.meta || !Array.isArray(loaderData.meta)) {
				return { title: "No Meta", meta: [{ title: "No Meta" }] };
			}
			return { meta: loaderData.meta };
		},
	} as const;
}
