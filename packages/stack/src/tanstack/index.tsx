"use client";
import { Link as TanStackLink, useRouter } from "@tanstack/react-router";
import { useMemo } from "react";
import type { StackRouter, StackRouterConfig } from "../context/router";

function TanStackLinkWrapper({
	href,
	children,
	...props
}: React.ComponentProps<"a"> & Record<string, any>) {
	return (
		<TanStackLink to={href} {...props}>
			{children}
		</TanStackLink>
	);
}

function useTanStackStackRouter(): StackRouter {
	const router = useRouter();

	return useMemo(
		() => ({
			navigate: (path: string) => {
				router.navigate({ href: path });
			},
			refresh: () => {
				router.invalidate();
			},
			getSearchParams: () =>
				new URLSearchParams(router.state.location.searchStr ?? ""),
			setSearchParams: (
				next: URLSearchParams,
				opts?: { replace?: boolean },
			) => {
				const query = next.toString();
				router.navigate({
					href: `${router.state.location.pathname}${query ? `?${query}` : ""}`,
					replace: opts?.replace,
				});
			},
		}),
		[router],
	);
}

/**
 * Router preset for TanStack Router / TanStack Start.
 *
 * @example
 * ```tsx
 * import { tanstackRouter } from "@btst/stack/tanstack";
 *
 * <StackProvider basePath="/pages" router={tanstackRouter()} api={{ baseURL, basePath: "/api/data" }}>
 * ```
 */
export function tanstackRouter(): StackRouterConfig {
	return {
		Link: TanStackLinkWrapper,
		useRouter: useTanStackStackRouter,
	};
}
