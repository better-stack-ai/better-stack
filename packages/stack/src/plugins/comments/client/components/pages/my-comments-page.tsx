"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
import { COMMENTS_LOCALIZATION } from "../../localization";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { PageWrapper } from "../shared/page-wrapper";

const UserCommentsPageInternal = lazy(() =>
	import("./my-comments-page.internal").then((m) => ({
		default: m.UserCommentsPage,
	})),
);

function UserCommentsPageSkeleton() {
	return (
		<div className="w-full max-w-3xl mx-auto space-y-4 animate-pulse">
			<div className="h-8 w-48 rounded bg-muted" />
			<div className="h-4 w-64 rounded bg-muted" />
			<div className="rounded-lg border h-96 bg-muted" />
		</div>
	);
}

export function UserCommentsPageComponent() {
	return (
		<ComposedRoute
			path="/comments"
			PageComponent={UserCommentsPageWrapper}
			LoadingComponent={UserCommentsPageSkeleton}
			onError={(error) =>
				console.error("[btst/comments] User Comments error:", error)
			}
		/>
	);
}

function UserCommentsPageWrapper() {
	const overrides = usePluginOverrides<CommentsPluginOverrides>("comments");
	const loc = { ...COMMENTS_LOCALIZATION, ...overrides.localization };

	useRouteLifecycle({
		routeName: "userComments",
		context: {
			path: "/comments",
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (o, context) => {
			if (o.onBeforeUserCommentsPageRendered) {
				const result = o.onBeforeUserCommentsPageRendered(context);
				return result === false ? false : true;
			}
			return true;
		},
	});

	return (
		<PageWrapper>
			<UserCommentsPageInternal
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
