"use client";

import React, { Suspense, useEffect, type ErrorInfo } from "react";
import { type FallbackProps } from "react-error-boundary";
import type { createRouter } from "@btst/yar";
import {
	PermissionCheck,
	useAuthContext,
	useCan,
	type PermissionCheckState,
} from "../../context/auth";
import { useStackOrNull } from "../../context/provider";
import {
	isSchemaBoundStackAuthProvider,
	type CanParams,
} from "../../shared/auth-types";
import {
	isPermissionRequest,
	type PermissionRequest,
} from "../../authorization";
import { ErrorBoundary } from "./error-boundary";

type RoutePermission = CanParams | PermissionRequest;

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
export function PermissionRouteAccess({
	permission,
	LoadingComponent,
	legacyPublic = false,
	children,
}: {
	permission: RoutePermission;
	LoadingComponent?: React.ComponentType;
	/** Preserve an explicitly public route for string-based RC providers. */
	legacyPublic?: boolean;
	children: React.ReactNode;
}) {
	const auth = useAuthContext();
	if (isPermissionRequest(permission)) {
		if (
			legacyPublic &&
			auth &&
			!isSchemaBoundStackAuthProvider(auth.provider)
		) {
			return <>{children}</>;
		}
		return (
			<PermissionCheck permission={permission}>
				{(state) => (
					<ResolvedRouteAccess
						state={state}
						permissionLabel={permission.id}
						LoadingComponent={LoadingComponent}
					>
						{children}
					</ResolvedRouteAccess>
				)}
			</PermissionCheck>
		);
	}

	return (
		<LegacyRouteGuard
			permission={permission}
			LoadingComponent={LoadingComponent}
		>
			{children}
		</LegacyRouteGuard>
	);
}

function getErrorStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const candidate = error as { statusCode?: unknown; status?: unknown };
	if (typeof candidate.statusCode === "number") return candidate.statusCode;
	return typeof candidate.status === "number" ? candidate.status : undefined;
}

function RouteErrorFallback({
	error,
	resetErrorBoundary,
	ErrorComponent,
	LoadingComponent,
}: FallbackProps & {
	ErrorComponent: React.ComponentType<FallbackProps>;
	LoadingComponent?: React.ComponentType;
}) {
	const auth = useAuthContext();
	const stack = useStackOrNull();
	const loginPath = auth?.provider.loginPath;
	const navigate = stack?.router?.navigate;
	const shouldRedirect =
		getErrorStatus(error) === 401 &&
		!!auth &&
		!auth.isPending &&
		!auth.error &&
		auth.identity === null &&
		!!loginPath;

	useEffect(() => {
		if (!shouldRedirect || !loginPath) return;
		if (navigate) {
			void navigate(loginPath);
		} else if (typeof window !== "undefined") {
			window.location.assign(loginPath);
		}
	}, [shouldRedirect, loginPath, navigate]);

	if (shouldRedirect) {
		return LoadingComponent ? <LoadingComponent /> : null;
	}

	return (
		<ErrorComponent error={error} resetErrorBoundary={resetErrorBoundary} />
	);
}

function ComposedRouteErrorBoundary({
	path,
	ErrorComponent,
	LoadingComponent,
	onError,
	children,
}: {
	path: string;
	ErrorComponent: React.ComponentType<FallbackProps>;
	LoadingComponent?: React.ComponentType;
	onError: (error: Error, info: ErrorInfo) => void;
	children: React.ReactNode;
}) {
	const FallbackComponent = React.useCallback(
		(props: FallbackProps) => (
			<RouteErrorFallback
				{...props}
				ErrorComponent={ErrorComponent}
				LoadingComponent={LoadingComponent}
			/>
		),
		[ErrorComponent, LoadingComponent],
	);

	return (
		<ErrorBoundary
			FallbackComponent={FallbackComponent}
			resetKeys={[path]}
			onError={onError}
		>
			{children}
		</ErrorBoundary>
	);
}

function LegacyRouteGuard({
	permission,
	LoadingComponent,
	children,
}: {
	permission: CanParams;
	LoadingComponent?: React.ComponentType;
	children: React.ReactNode;
}) {
	const state = useCan(permission);
	return (
		<ResolvedRouteAccess
			state={state}
			permissionLabel={`${permission.resource}.${permission.action}`}
			LoadingComponent={LoadingComponent}
		>
			{children}
		</ResolvedRouteAccess>
	);
}

function ResolvedRouteAccess({
	state,
	permissionLabel,
	LoadingComponent,
	children,
}: {
	state: PermissionCheckState;
	permissionLabel: string;
	LoadingComponent?: React.ComponentType;
	children: React.ReactNode;
}) {
	const auth = useAuthContext();
	const stack = useStackOrNull();
	const { can, isPending, error } = state;

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
	if (error) throw error;

	if (isPending || shouldRedirect) {
		return LoadingComponent ? <LoadingComponent /> : null;
	}

	if (can) {
		return <>{children}</>;
	}

	// Keep the thrown message generic — ErrorComponents commonly render
	// error.message to end-users; the resource/action detail is dev-only.
	if (process.env.NODE_ENV !== "production") {
		console.warn(`[btst/auth] RouteGuard denied: ${permissionLabel}`);
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
 * @param legacyPublic - Keeps an explicitly public descriptor route ungated
 *   for string-based RC providers. One-rule providers still evaluate it.
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
	legacyPublic = false,
}: {
	path: string;
	PageComponent: React.ComponentType<any>;
	ErrorComponent?: React.ComponentType<FallbackProps>;
	LoadingComponent: React.ComponentType;
	onNotFound?: () => never;
	NotFoundComponent?: React.ComponentType<{ message: string }>;
	props?: any;
	onError: (error: Error, info: ErrorInfo) => void;
	permission?: RoutePermission;
	legacyPublic?: boolean;
}) {
	if (PageComponent) {
		const content = permission ? (
			<PermissionRouteAccess
				permission={permission}
				LoadingComponent={LoadingComponent}
				legacyPublic={legacyPublic}
			>
				<PageComponent {...props} />
			</PermissionRouteAccess>
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
					<ComposedRouteErrorBoundary
						path={path}
						ErrorComponent={ErrorComponent}
						LoadingComponent={LoadingComponent}
						onError={onError}
					>
						<Suspense key={`inner-${path}`} fallback={suspenseFallback}>
							{content}
						</Suspense>
					</ComposedRouteErrorBoundary>
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
