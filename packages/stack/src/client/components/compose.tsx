"use client";

import React, { Suspense, type ErrorInfo } from "react";
import { type FallbackProps } from "react-error-boundary";
import type { createRouter } from "@btst/yar";
import { ErrorBoundary } from "./error-boundary";

/**
 * Route type with optional components
 */
export type RouteWithComponents =
	| {
			PageComponent?: React.ComponentType;
			ErrorComponent?: React.ComponentType<FallbackProps>;
			LoadingComponent?: React.ComponentType;
	  }
	| null
	| undefined;

/**
 * Composes the route content with Suspense and Error Boundary
 * Resolves the route on the client-side where component references are available
 *
 * This is marked "use client" so it can access component references safely
 */
export function RouteRenderer({
	router,
	path,
	NotFoundComponent,
	onNotFound,
	onError,
	props,
}: {
	router: ReturnType<typeof createRouter>;
	path: string;
	NotFoundComponent?: React.ComponentType<{ message: string }>;
	onNotFound?: () => never;
	onError: (error: Error, info: ErrorInfo) => void;
	props?: any;
}) {
	// Resolve route on the client where components are available
	const route = router.getRoute(path);

	return (
		<ComposedRoute
			path={path}
			PageComponent={route?.PageComponent}
			ErrorComponent={route?.ErrorComponent}
			LoadingComponent={route?.LoadingComponent}
			onNotFound={onNotFound}
			NotFoundComponent={NotFoundComponent}
			onError={onError}
			props={props}
		/>
	);
}

/**
 * Renders a route with Suspense and ErrorBoundary wrappers.
 * Handles loading states, error boundaries, and not-found scenarios for a single route.
 *
 * @param path - The current route path
 * @param PageComponent - The page component to render
 * @param ErrorComponent - Optional error fallback component
 * @param LoadingComponent - Component to show during suspense
 * @param onNotFound - Optional callback when route is not found
 * @param NotFoundComponent - Optional component to show for 404s
 * @param props - Additional props to pass to the page component
 * @param onError - Error handler callback for the error boundary
 */
export function ComposedRoute({
	path,
	PageComponent,
	ErrorComponent,
	LoadingComponent,
	onNotFound,
	NotFoundComponent,
	props,
	onError,
}: {
	path: string;
	PageComponent: React.ComponentType<any>;
	ErrorComponent?: React.ComponentType<FallbackProps>;
	LoadingComponent: React.ComponentType;
	onNotFound?: () => never;
	NotFoundComponent?: React.ComponentType<{ message: string }>;
	props?: any;
	onError: (error: Error, info: ErrorInfo) => void;
}) {
	if (PageComponent) {
		const content = <PageComponent {...props} />;
		// Always provide the same fallback on server and client — using
		// `typeof window !== "undefined"` here would produce a different JSX tree
		// on each side, shifting React's useId() counter and causing hydration
		// mismatches in any descendant that uses Radix (Select, Dialog, etc.).
		// If the Suspense boundary never actually suspends during SSR (data is
		// prefetched), React won't emit the fallback into the HTML anyway.
		const suspenseFallback = LoadingComponent ? <LoadingComponent /> : null;

		// If an ErrorComponent is provided (which itself may be lazy), ensure we have
		// a Suspense boundary that can handle both the page content and the lazy error UI
		if (ErrorComponent) {
			return (
				<Suspense key={`outer-${path}`} fallback={suspenseFallback}>
					<ErrorBoundary
						FallbackComponent={ErrorComponent}
						resetKeys={[path]}
						onError={onError}
					>
						<Suspense key={`inner-${path}`} fallback={suspenseFallback}>
							{content}
						</Suspense>
					</ErrorBoundary>
				</Suspense>
			);
		}

		return (
			<Suspense key={path} fallback={suspenseFallback}>
				{content}
			</Suspense>
		);
	} else {
		if (onNotFound) {
			onNotFound();
		}

		if (NotFoundComponent) {
			return <NotFoundComponent message={`Unknown route: ${path}`} />;
		}
	}
}
