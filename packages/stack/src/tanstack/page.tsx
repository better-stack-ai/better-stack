import type { QueryClient } from "@tanstack/react-query";
import { notFound, useParams, useRouteContext } from "@tanstack/react-router";
import { normalizePath } from "../client/path-utils";
import type { GetStackClient } from "../shared/entry-factories";

export interface CreateTanStackPageOptions {
	/** Returns the stack client for a given QueryClient (`lib/stack-client`). */
	getStackClient: GetStackClient;
	/**
	 * Returns the QueryClient for the current context. Defaults to the
	 * `queryClient` from the router context (set up by
	 * `setupRouterSsrQueryIntegration`).
	 */
	getQueryClient?: () => QueryClient;
}

interface TanStackPageLoaderArgs {
	params: { _splat?: string };
	context?: unknown;
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
export function createTanStackPageOptions(options: CreateTanStackPageOptions) {
	const { getStackClient, getQueryClient } = options;

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
		const route = getStackClient(resolveQueryClient(context)).router.getRoute(
			routePath,
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
		loader: async ({ params, context }: TanStackPageLoaderArgs) => {
			const queryClient = resolveQueryClient(context);
			const routePath = normalizePath(params._splat);
			const route = getStackClient(queryClient).router.getRoute(routePath);
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
