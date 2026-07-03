"use client";
import NextImage from "next/image";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { StackRouter, StackRouterConfig } from "../context/router";

function NextLinkWrapper({
	href,
	...props
}: React.ComponentProps<"a"> & Record<string, any>) {
	return <NextLink href={href || "#"} {...props} />;
}

/**
 * Next.js Image wrapper for plugins.
 * Handles both cases: with explicit dimensions or using fill mode.
 */
function NextImageWrapper(props: React.ImgHTMLAttributes<HTMLImageElement>) {
	const { alt = "", src = "", width, height, ...rest } = props;

	// Use fill mode if width or height are not provided
	if (!width || !height) {
		return (
			<span className="block relative w-full h-full">
				<NextImage
					alt={alt}
					src={typeof src === "string" ? src : ""}
					fill
					sizes="400px"
					{...rest}
				/>
			</span>
		);
	}

	return (
		<NextImage
			alt={alt}
			src={typeof src === "string" ? src : ""}
			width={width as number}
			height={height as number}
			{...rest}
		/>
	);
}

// Reads window.location.search instead of Next's useSearchParams() hook to
// avoid forcing a Suspense/CSR bailout during static generation. Returns
// empty params on the server.
function getSearchParams(): URLSearchParams {
	return new URLSearchParams(
		typeof window !== "undefined" ? window.location.search : "",
	);
}

function useNextStackRouter(): StackRouter {
	const router = useRouter();

	return useMemo(
		() => ({
			navigate: (path: string) => {
				router.push(path);
			},
			refresh: () => {
				router.refresh();
			},
			setSearchParams: (
				next: URLSearchParams,
				opts?: { replace?: boolean },
			) => {
				const query = next.toString();
				const path = `${window.location.pathname}${query ? `?${query}` : ""}`;
				if (opts?.replace) {
					router.replace(path);
				} else {
					router.push(path);
				}
			},
		}),
		[router],
	);
}

/**
 * Router preset for Next.js (App Router).
 *
 * @example
 * ```tsx
 * import { nextRouter } from "@btst/stack/next";
 *
 * <StackProvider basePath="/pages" router={nextRouter()} api={{ baseURL, basePath: "/api/data" }}>
 * ```
 */
export function nextRouter(): StackRouterConfig {
	return {
		Link: NextLinkWrapper,
		Image: NextImageWrapper,
		getSearchParams,
		useRouter: useNextStackRouter,
	};
}
