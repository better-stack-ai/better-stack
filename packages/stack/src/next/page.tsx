import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { DehydrateOptions, QueryClient } from "@tanstack/react-query";
import type { Metadata } from "next";
import { notFound as nextNotFound } from "next/navigation";
import type { ReactNode } from "react";
import { metaElementsToObject } from "../client/meta-utils";
import { normalizePath } from "../client/path-utils";
import {
	type GetStackClient,
	stackDehydrateOptions,
} from "../shared/entry-factories";

export interface NextPageProps {
	params: Promise<{ all?: string[] }>;
}

export interface CreateNextPageOptions {
	/** Returns the stack client for a given QueryClient (`lib/stack-client`). */
	getStackClient: GetStackClient;
	/** Returns the QueryClient for the current context (`lib/query-client`). */
	getQueryClient: () => QueryClient;
	/**
	 * Called when no route matches the path. Defaults to `notFound()` from
	 * `next/navigation`.
	 */
	notFound?: () => never;
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
 * Creates the Next.js catch-all page for BTST plugin routes: SSR prefetch via
 * `route.loader()`, React Query dehydration (including failed queries),
 * `generateMetadata` with loader-before-meta ordering, and 404 via
 * `notFound()`.
 *
 * @example
 * ```tsx
 * // app/pages/[[...all]]/page.tsx
 * import { createNextPage } from "@btst/stack/next";
 * import { getOrCreateQueryClient } from "@/lib/query-client";
 * import { getStackClient } from "@/lib/stack-client";
 *
 * export const dynamic = "force-dynamic";
 * const page = createNextPage({ getStackClient, getQueryClient: getOrCreateQueryClient });
 * export default page.Page;
 * export const generateMetadata = page.generateMetadata;
 * ```
 */
export function createNextPage(options: CreateNextPageOptions) {
	const {
		getStackClient,
		getQueryClient,
		notFound = nextNotFound,
		wrapPage,
		dehydrateOptions = stackDehydrateOptions,
	} = options;

	async function Page({ params }: NextPageProps) {
		const pathParams = await params;
		const path = normalizePath(pathParams?.all);
		const queryClient = getQueryClient();
		const route = getStackClient(queryClient).router.getRoute(path);

		if (route?.loader) {
			await route.loader();
		}

		const page = route?.PageComponent ? <route.PageComponent /> : notFound();

		return (
			<HydrationBoundary state={dehydrate(queryClient, dehydrateOptions)}>
				{wrapPage ? wrapPage(page) : page}
			</HydrationBoundary>
		);
	}

	async function generateMetadata({
		params,
	}: NextPageProps): Promise<Metadata> {
		const pathParams = await params;
		const path = normalizePath(pathParams?.all);
		const queryClient = getQueryClient();
		const route = getStackClient(queryClient).router.getRoute(path);

		if (!route) {
			return notFound();
		}
		if (!route.meta) {
			return {};
		}
		if (route.loader) {
			await route.loader();
		}
		return metaElementsToObject(await route.meta()) satisfies Metadata;
	}

	return { Page, generateMetadata };
}
