"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { PageWrapper } from "../shared/page-wrapper";
import { commentsPermissions } from "../../../permissions";

const ResourceCommentsPageInternal = lazy(() =>
	import("./resource-comments-page.internal").then((m) => ({
		default: m.ResourceCommentsPage,
	})),
);

function ResourceCommentsSkeleton() {
	return (
		<div className="w-full max-w-3xl mx-auto space-y-4 animate-pulse">
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
			permission={commentsPermissions.thread.read({
				scope: "moderation",
				status: "pending",
				resourceId,
				resourceType,
			})}
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
	});
	return (
		<PageWrapper>
			<ResourceCommentsPageInternal
				resourceId={resourceId}
				resourceType={resourceType}
				localization={overrides.localization}
			/>
		</PageWrapper>
	);
}
