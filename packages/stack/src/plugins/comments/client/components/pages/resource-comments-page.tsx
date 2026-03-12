"use client";

import { lazy, Suspense } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

const ResourceCommentsPageInternal = lazy(() =>
	import("./resource-comments-page.internal").then((m) => ({
		default: m.ResourceCommentsPage,
	})),
);

function ResourceCommentsSkeleton() {
	return (
		<div className="w-full max-w-3xl space-y-4 animate-pulse">
			<div className="h-8 w-48 rounded bg-muted" />
			<div className="h-4 w-64 rounded bg-muted" />
			<div className="rounded-lg border h-32 bg-muted" />
		</div>
	);
}

export function ResourceCommentsPageComponent({
	resourceId,
	resourceType,
}: {
	resourceId: string;
	resourceType: string;
}) {
	return (
		<ComposedRoute
			path={`/comments/${resourceType}/${resourceId}`}
			PageComponent={() => (
				<ResourceCommentsPageWrapper
					resourceId={resourceId}
					resourceType={resourceType}
				/>
			)}
			LoadingComponent={ResourceCommentsSkeleton}
			onError={(error) =>
				console.error("[btst/comments] Resource comments error:", error)
			}
		/>
	);
}

function ResourceCommentsPageWrapper({
	resourceId,
	resourceType,
}: {
	resourceId: string;
	resourceType: string;
}) {
	const overrides = usePluginOverrides<CommentsPluginOverrides>("comments");

	useRouteLifecycle({
		routeName: "resourceComments",
		context: {
			path: `/comments/${resourceType}/${resourceId}`,
			params: { resourceId, resourceType },
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (o, context) => {
			if (o.onBeforeResourceCommentsRendered) {
				return o.onBeforeResourceCommentsRendered(
					resourceType,
					resourceId,
					context,
				);
			}
			return true;
		},
	});

	return (
		<div className="w-full p-4 md:p-6 lg:p-8 flex flex-col items-start">
			<Suspense fallback={<ResourceCommentsSkeleton />}>
				<ResourceCommentsPageInternal
					resourceId={resourceId}
					resourceType={resourceType}
					apiBaseURL={overrides.apiBaseURL}
					apiBasePath={overrides.apiBasePath}
					headers={overrides.headers as HeadersInit | undefined}
				/>
			</Suspense>
		</div>
	);
}
