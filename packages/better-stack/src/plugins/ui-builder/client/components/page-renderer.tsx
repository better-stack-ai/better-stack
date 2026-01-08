"use client";

import type { ComponentType, ReactNode } from "react";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import LayerRenderer from "@workspace/ui/components/ui-builder/layer-renderer";
import type {
	ComponentRegistry,
	PropValue,
} from "@workspace/ui/components/ui-builder/types";
import { useUIBuilderPageBySlug } from "../hooks/ui-builder-hooks";
import { defaultComponentRegistry } from "../registry";
import { uiBuilderLocalization } from "../localization";

/**
 * Default loading component for PageRenderer
 */
function DefaultLoadingComponent(): ReactNode {
	return (
		<div className="flex items-center justify-center min-h-[200px]">
			<div className="animate-pulse text-muted-foreground">
				{uiBuilderLocalization.pageRenderer.loading}
			</div>
		</div>
	);
}

/**
 * Default error component for PageRenderer
 */
function DefaultErrorComponent({ error }: { error: Error }): ReactNode {
	return (
		<div className="flex flex-col items-center justify-center min-h-[200px] p-4">
			<div className="text-destructive font-medium">
				{uiBuilderLocalization.pageRenderer.error}
			</div>
			<div className="text-sm text-muted-foreground mt-2">{error.message}</div>
		</div>
	);
}

/**
 * Default not found component for PageRenderer
 */
function DefaultNotFoundComponent(): ReactNode {
	return (
		<div className="flex items-center justify-center min-h-[200px]">
			<div className="text-muted-foreground">
				{uiBuilderLocalization.pageRenderer.notFound}
			</div>
		</div>
	);
}

export interface PageRendererProps {
	/** URL slug of the UI Builder page to render */
	slug: string;
	/** Component registry to use for rendering (defaults to defaultComponentRegistry) */
	componentRegistry?: ComponentRegistry;
	/** Runtime variable values to override defaults */
	variableValues?: Record<string, PropValue>;
	/** Custom loading component */
	LoadingComponent?: ComponentType;
	/** Custom error component */
	ErrorComponent?: ComponentType<{ error: Error }>;
	/** Custom not found component */
	NotFoundComponent?: ComponentType;
	/** Additional className for the container */
	className?: string;
}

/**
 * Internal component that fetches and renders a UI Builder page
 */
function PageRendererContent({
	slug,
	componentRegistry = defaultComponentRegistry,
	variableValues,
	NotFoundComponent = DefaultNotFoundComponent,
	className,
}: Omit<PageRendererProps, "LoadingComponent" | "ErrorComponent">) {
	const { page, layers, variables, isLoading } = useUIBuilderPageBySlug(slug);

	if (isLoading) {
		return <DefaultLoadingComponent />;
	}

	if (!page || layers.length === 0) {
		return <NotFoundComponent />;
	}

	// Get the first page layer (root)
	const rootLayer = layers[0];

	if (!rootLayer) {
		return <NotFoundComponent />;
	}

	return (
		<LayerRenderer
			className={className}
			page={rootLayer}
			componentRegistry={componentRegistry}
			variables={variables}
			variableValues={variableValues}
		/>
	);
}

/**
 * PageRenderer - Renders a UI Builder page by slug
 *
 * A convenient component for rendering UI Builder pages on public-facing routes.
 * Handles loading states, error boundaries, and 404 cases automatically.
 *
 * @example
 * ```tsx
 * // Basic usage with default registry
 * import { PageRenderer } from "@btst/stack/plugins/ui-builder/client"
 *
 * export default function Page({ params }: { params: { slug: string } }) {
 *   return <PageRenderer slug={params.slug} />
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With custom component registry
 * import { PageRenderer, createComponentRegistry } from "@btst/stack/plugins/ui-builder/client"
 * import { defaultComponentRegistry } from "@btst/stack/plugins/ui-builder/client"
 *
 * const customRegistry = createComponentRegistry({
 *   ...defaultComponentRegistry,
 *   MyCustomComponent: { component: MyComponent, schema: mySchema },
 * })
 *
 * export default function Page({ params }: { params: { slug: string } }) {
 *   return (
 *     <PageRenderer
 *       slug={params.slug}
 *       componentRegistry={customRegistry}
 *     />
 *   )
 * }
 * ```
 *
 * @example
 * ```tsx
 * // With variable values for dynamic content
 * import { PageRenderer } from "@btst/stack/plugins/ui-builder/client"
 *
 * export default function Page({ params }: { params: { slug: string } }) {
 *   const user = useCurrentUser()
 *
 *   return (
 *     <PageRenderer
 *       slug={params.slug}
 *       variableValues={{
 *         userName: user?.name ?? "Guest",
 *         isLoggedIn: !!user,
 *       }}
 *     />
 *   )
 * }
 * ```
 */
export function PageRenderer({
	slug,
	componentRegistry = defaultComponentRegistry,
	variableValues,
	LoadingComponent = DefaultLoadingComponent,
	ErrorComponent = DefaultErrorComponent,
	NotFoundComponent = DefaultNotFoundComponent,
	className,
}: PageRendererProps): ReactNode {
	return (
		<ErrorBoundary
			FallbackComponent={({ error }) => <ErrorComponent error={error} />}
		>
			<Suspense fallback={<LoadingComponent />}>
				<PageRendererContent
					slug={slug}
					componentRegistry={componentRegistry}
					variableValues={variableValues}
					NotFoundComponent={NotFoundComponent}
					className={className}
				/>
			</Suspense>
		</ErrorBoundary>
	);
}

/**
 * SuspensePageRenderer - Suspense-based PageRenderer for SSR
 *
 * Similar to PageRenderer but designed for use with React Suspense streaming.
 * Use this when you want the server to wait for the page data before sending HTML.
 *
 * @example
 * ```tsx
 * import { Suspense } from "react"
 * import { SuspensePageRenderer } from "@btst/stack/plugins/ui-builder/client"
 *
 * export default function Page({ params }: { params: { slug: string } }) {
 *   return (
 *     <Suspense fallback={<PageSkeleton />}>
 *       <SuspensePageRenderer slug={params.slug} />
 *     </Suspense>
 *   )
 * }
 * ```
 */
export function SuspensePageRenderer({
	slug,
	componentRegistry = defaultComponentRegistry,
	variableValues,
	NotFoundComponent = DefaultNotFoundComponent,
	className,
}: Omit<PageRendererProps, "LoadingComponent" | "ErrorComponent">): ReactNode {
	return (
		<PageRendererContent
			slug={slug}
			componentRegistry={componentRegistry}
			variableValues={variableValues}
			NotFoundComponent={NotFoundComponent}
			className={className}
		/>
	);
}
