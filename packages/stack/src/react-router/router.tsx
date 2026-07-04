"use client";
import { useMemo } from "react";
import {
	Link as ReactRouterLink,
	useNavigate,
	useRevalidator,
	useSearchParams,
} from "react-router";
import type { StackRouter, StackRouterConfig } from "../context/router";

function ReactRouterLinkWrapper({
	href,
	children,
	...props
}: React.ComponentProps<"a"> & Record<string, any>) {
	return (
		<ReactRouterLink to={href || ""} {...props}>
			{children}
		</ReactRouterLink>
	);
}

function useReactRouterStackRouter(): StackRouter {
	const navigate = useNavigate();
	const { revalidate } = useRevalidator();
	const [searchParams, setSearchParams] = useSearchParams();

	return useMemo(
		() => ({
			navigate: (path: string) => {
				void navigate(path);
			},
			refresh: () => {
				void revalidate();
			},
			getSearchParams: () => new URLSearchParams(searchParams),
			setSearchParams: (
				next: URLSearchParams,
				opts?: { replace?: boolean },
			) => {
				setSearchParams(next, { replace: opts?.replace });
			},
		}),
		[navigate, revalidate, searchParams, setSearchParams],
	);
}

/**
 * Router preset for React Router (v7).
 *
 * @example
 * ```tsx
 * import { reactRouter } from "@btst/stack/react-router";
 *
 * <StackProvider basePath="/pages" router={reactRouter()} api={{ baseURL, basePath: "/api/data" }}>
 * ```
 */
export function reactRouter(): StackRouterConfig {
	return {
		Link: ReactRouterLinkWrapper,
		useRouter: useReactRouterStackRouter,
	};
}
