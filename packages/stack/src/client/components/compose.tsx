"use client";

import React, { Suspense, useEffect, type ErrorInfo } from "react";
import { type FallbackProps } from "react-error-boundary";
import type { createRouter } from "@btst/yar";
import { useAuthContext, useCan } from "../../context/auth";
import { useStackOrNull } from "../../context/provider";
import type { CanParams } from "../../shared/auth-types";
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
	// Resolve route on the client where components are available.
	// Memoized so PageComponent keeps a stable identity across re-renders:
	// getRoute() invokes the route handler, which produces new component
	// references each call. Without the memo, React would treat every parent
	// re-render as a component type change and remount the whole subtree
	// (losing state and re-triggering Suspense).
	const route = React.useMemo(() => router.getRoute(path), [router, path]);

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
 * Route-level permission gate used by `ComposedRoute` when a `permission`
 * is declared.
 *
 * - Without an auth provider on `StackProvider`, renders children unchanged.
 * - While the identity/permission check is pending, renders the route's
 *   `LoadingComponent` so gated content never flashes.
 * - On deny: unauthenticated users are redirected to the provider's
 *   `loginPath` (via the top-level router's `navigate`, falling back to
 *   `window.location.assign`); authenticated users get an `Unauthorized`
 *   error thrown into the route's ErrorBoundary.
 */
function RouteGuard({
	permission,
	LoadingComponent,
	children,
}: {
	permission: CanParams;
	LoadingComponent?: React.ComponentType;
	children: React.ReactNode;
}) {
	const auth = useAuthContext();
	const stack = useStackOrNull();
	const { can, isPending } = useCan(permission);

	const identity = auth?.identity ?? null;
	const loginPath = auth?.provider.loginPath;
	const navigate = stack?.router?.navigate;

	const shouldRedirect =
		!!auth && !isPending && !can && !identity && !!loginPath;

	useEffect(() => {
		if (!shouldRedirect || !loginPath) return;
		if (navigate) {
			void navigate(loginPath);
		} else if (typeof window !== "undefined") {
			window.location.assign(loginPath);
		}
	}, [shouldRedirect, loginPath, navigate]);

	// No auth provider configured: gating is disabled, behave exactly as before.
	if (!auth) {
		return <>{children}</>;
	}

	if (isPending || shouldRedirect) {
		return LoadingComponent ? <LoadingComponent /> : null;
	}

	if (can) {
		return <>{children}</>;
	}

	// Keep the thrown message generic — ErrorComponents commonly render
	// error.message to end-users; the resource/action detail is dev-only.
	if (process.env.NODE_ENV !== "production") {
		console.warn(
			`[btst/auth] RouteGuard denied: cannot ${permission.action} ${permission.resource}`,
		);
	}
	throw new Error("Unauthorized");
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
 * @param props - Additional props to pass to the page component. For routes
 *   created with `defineRoute`, these are merged after the route context, so
 *   a prop named `params` or `query` intentionally takes precedence over the
 *   router-extracted values. Only pass trusted, framework-controlled values.
 * @param onError - Error handler callback for the error boundary
 * @param permission - Optional route-level permission requirement (e.g.
 *   `{ resource: "blog:draft", action: "read" }`). Only enforced when an
 *   auth provider is configured on `StackProvider`; see `RouteGuard`.
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
	permission,
}: {
	path: string;
	PageComponent: React.ComponentType<any>;
	ErrorComponent?: React.ComponentType<FallbackProps>;
	LoadingComponent: React.ComponentType;
	onNotFound?: () => never;
	NotFoundComponent?: React.ComponentType<{ message: string }>;
	props?: any;
	onError: (error: Error, info: ErrorInfo) => void;
	permission?: CanParams;
}) {
	if (PageComponent) {
		const content = permission ? (
			<RouteGuard permission={permission} LoadingComponent={LoadingComponent}>
				<PageComponent {...props} />
			</RouteGuard>
		) : (
			<PageComponent {...props} />
		);
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
