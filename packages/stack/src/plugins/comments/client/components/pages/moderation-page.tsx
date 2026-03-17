"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
import { COMMENTS_LOCALIZATION } from "../../localization";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { PageWrapper } from "../shared/page-wrapper";

const ModerationPageInternal = lazy(() =>
	import("./moderation-page.internal").then((m) => ({
		default: m.ModerationPage,
	})),
);

function ModerationPageSkeleton() {
	return (
		<div className="w-full max-w-5xl mx-auto space-y-4 animate-pulse">
			<div className="h-8 w-64 rounded bg-muted" />
			<div className="h-4 w-48 rounded bg-muted" />
			<div className="h-10 w-72 rounded bg-muted" />
			<div className="rounded-lg border h-64 bg-muted" />
		</div>
	);
}

export function ModerationPageComponent() {
	return (
		<ComposedRoute
			path="/comments/moderation"
			PageComponent={ModerationPageWrapper}
			LoadingComponent={ModerationPageSkeleton}
			onError={(error) =>
				console.error("[btst/comments] Moderation error:", error)
			}
		/>
	);
}

function ModerationPageWrapper() {
	const overrides = usePluginOverrides<CommentsPluginOverrides>("comments");
	const loc = { ...COMMENTS_LOCALIZATION, ...overrides.localization };

	useRouteLifecycle({
		routeName: "moderation",
		context: {
			path: "/comments/moderation",
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (o, context) => {
			if (o.onBeforeModerationPageRendered) {
				return o.onBeforeModerationPageRendered(context);
			}
			return true;
		},
	});

	return (
		<PageWrapper>
			<ModerationPageInternal
				apiBaseURL={overrides.apiBaseURL}
				apiBasePath={overrides.apiBasePath}
				headers={overrides.headers as HeadersInit | undefined}
				localization={loc}
			/>
		</PageWrapper>
	);
}
