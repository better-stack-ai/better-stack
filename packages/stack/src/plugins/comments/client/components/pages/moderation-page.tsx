"use client";

import { lazy } from "react";
import { useListState } from "@btst/stack/client";
import { ComposedRoute } from "@btst/stack/client/components";
import { usePluginOverrides } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { PageWrapper } from "../shared/page-wrapper";
import { commentsPermissions } from "../../../permissions";
import {
	MODERATION_LIST_STATE_SCHEMA,
	resolveModerationStatus,
} from "./moderation-state";

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
	const [listState] = useListState(
		"comments-moderation",
		MODERATION_LIST_STATE_SCHEMA,
	);
	const status = resolveModerationStatus(listState.tab);
	return (
		<ComposedRoute
			path="/comments/moderation"
			PageComponent={ModerationPageWrapper}
			LoadingComponent={ModerationPageSkeleton}
			permission={commentsPermissions.thread.read({
				scope: "moderation",
				status,
			})}
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
	});

	return (
		<PageWrapper>
			<ModerationPageInternal localization={overrides.localization} />
		</PageWrapper>
	);
}
