"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
import { COMMENTS_LOCALIZATION } from "../../localization";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { PageWrapper } from "../shared/page-wrapper";

const MyCommentsPageInternal = lazy(() =>
	import("./my-comments-page.internal").then((m) => ({
		default: m.MyCommentsPage,
	})),
);

function MyCommentsPageSkeleton() {
	return (
		<div className="w-full max-w-3xl space-y-4 animate-pulse">
			<div className="h-8 w-48 rounded bg-muted" />
			<div className="h-4 w-64 rounded bg-muted" />
			<div className="rounded-lg border h-96 bg-muted" />
		</div>
	);
}

export function MyCommentsPageComponent() {
	return (
		<ComposedRoute
			path="/comments/my-comments"
			PageComponent={MyCommentsPageWrapper}
			LoadingComponent={MyCommentsPageSkeleton}
			onError={(error) =>
				console.error("[btst/comments] My Comments error:", error)
			}
		/>
	);
}

function MyCommentsPageWrapper() {
	const overrides = usePluginOverrides<CommentsPluginOverrides>("comments");
	const loc = { ...COMMENTS_LOCALIZATION, ...overrides.localization };

	useRouteLifecycle({
		routeName: "myComments",
		context: {
			path: "/comments/my-comments",
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (o, context) => {
			if (o.onBeforeMyCommentsPageRendered) {
				const result = o.onBeforeMyCommentsPageRendered(context);
				return result === false ? false : true;
			}
			return true;
		},
	});

	return (
		<PageWrapper>
			<MyCommentsPageInternal
				apiBaseURL={overrides.apiBaseURL}
				apiBasePath={overrides.apiBasePath}
				headers={overrides.headers as HeadersInit | undefined}
				currentUserId={overrides.currentUserId}
				resourceLinks={overrides.resourceLinks}
				localization={loc}
			/>
		</PageWrapper>
	);
}
