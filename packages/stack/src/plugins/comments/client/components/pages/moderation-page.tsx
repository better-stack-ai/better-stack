"use client";

import { lazy, Suspense } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";

const ModerationPageInternal = lazy(() =>
	import("./moderation-page.internal").then((m) => ({
		default: m.ModerationPage,
	})),
);

function ModerationPageSkeleton() {
	return (
		<div className="w-full max-w-5xl space-y-4 animate-pulse">
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
		<div className="w-full p-4 md:p-6 lg:p-8 flex flex-col items-start">
			<Suspense fallback={<ModerationPageSkeleton />}>
				<ModerationPageInternal
					apiBaseURL={overrides.apiBaseURL}
					apiBasePath={overrides.apiBasePath}
					headers={overrides.headers as HeadersInit | undefined}
				/>
			</Suspense>
		</div>
	);
}
