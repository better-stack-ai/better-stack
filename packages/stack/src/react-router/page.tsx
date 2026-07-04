import {
	HydrationBoundary,
	dehydrate,
	useQueryClient,
} from "@tanstack/react-query";
import type { DehydrateOptions, QueryClient } from "@tanstack/react-query";
import type { ComponentType, ReactNode } from "react";
import { useLoaderData, useRouteError } from "react-router";
import { normalizePath } from "../client/path-utils";
import {
	type GetStackClient,
	stackDehydrateOptions,
} from "../shared/entry-factories";

/**
 * Loose structural form of React Router's generated `Route.LoaderArgs` /
 * `Route.MetaArgs` for a catch-all route. The generated `./+types/$` types
 * are not available inside the library, so the factory types the subset it
 * uses; the results remain assignable to the generated route exports.
 */
export interface ReactRouterPageLoaderArgs {
	params: { "*"?: string } & Record<string, string | undefined>;
}

export interface CreateReactRouterPageOptions {
	/** Returns the stack client for a given QueryClient (`lib/stack-client`). */
	getStackClient: GetStackClient;
	/** Returns the QueryClient for the current context (`lib/query-client`). */
	getQueryClient: () => QueryClient;
	/** Rendered when no route matches. Defaults to a "Route not found" div. */
	NotFound?: ComponentType;
	/**
	 * Rendered when the route errors. Defaults to a `<pre>` with the
	 * stringified error — provide your own component for a production-safe
	 * error UI (use `useRouteError()` from react-router to read the error).
	 */
	ErrorBoundary?: ComponentType;
	/** Wraps the rendered page (inside the `HydrationBoundary`). */
	wrapPage?: (page: ReactNode) => ReactNode;
	/**
	 * Options passed to `dehydrate()`. Defaults to dehydrating failed queries
	 * in addition to the React Query defaults, so the client does not refetch
	 * queries that errored during SSR. Override e.g. to sanitize error
	 * payloads before they are serialized into the HTML.
	 */
	dehydrateOptions?: DehydrateOptions;
}

/**
 * Creates the React Router catch-all route pieces for BTST plugin routes:
 * SSR prefetch via `route.loader()`, React Query dehydration (including
 * failed queries), and loader-before-meta ordering.
 *
 * @example
 * ```tsx
 * // app/routes/pages/$.tsx
 * import { createReactRouterPage } from "@btst/stack/react-router";
 * import { getOrCreateQueryClient } from "~/lib/query-client";
 * import { getStackClient } from "~/lib/stack-client";
 *
 * const page = createReactRouterPage({ getStackClient, getQueryClient: getOrCreateQueryClient });
 * export const loader = page.loader;
 * export const meta = page.meta;
 * export default page.Component;
 * ```
 */
export function createReactRouterPage(options: CreateReactRouterPageOptions) {
	const {
		getStackClient,
		getQueryClient,
		NotFound,
		ErrorBoundary: CustomErrorBoundary,
		wrapPage,
		dehydrateOptions = stackDehydrateOptions,
	} = options;

	async function loader({ params }: ReactRouterPageLoaderArgs) {
		const queryClient = getQueryClient();
		const path = normalizePath(params["*"]);
		const route = getStackClient(queryClient).router.getRoute(path);

		if (route?.loader) {
			await route.loader();
		}

		return {
			path,
			dehydratedState: dehydrate(queryClient, dehydrateOptions),
			meta: await route?.meta?.(),
		};
	}

	type LoaderData = Awaited<ReturnType<typeof loader>>;

	// Recent React Router versions pass `loaderData`; older 7.x used `data`.
	function meta(args: { loaderData?: LoaderData; data?: LoaderData }) {
		return (args.loaderData ?? args.data)?.meta;
	}

	function Component() {
		const data = useLoaderData<typeof loader>();
		const queryClient = useQueryClient();
		const route = getStackClient(queryClient).router.getRoute(data.path);
		const page = route?.PageComponent ? (
			<route.PageComponent />
		) : NotFound ? (
			<NotFound />
		) : (
			<div>Route not found</div>
		);

		return (
			<HydrationBoundary state={data.dehydratedState}>
				{wrapPage ? wrapPage(page) : page}
			</HydrationBoundary>
		);
	}

	function DefaultErrorBoundary() {
		const error = useRouteError();
		return <pre>{String(error)}</pre>;
	}

	return {
		loader,
		meta,
		Component,
		ErrorBoundary: CustomErrorBoundary ?? DefaultErrorBoundary,
	};
}
