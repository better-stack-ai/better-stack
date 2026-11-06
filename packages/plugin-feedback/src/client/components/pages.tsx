"use client";

import { lazy } from "react";
import {
	ComposedRoute,
	PermissionRouteAccess,
} from "@btst/stack/client/components";
import { useFeedbackPost } from "../hooks";
import { feedbackPermissions } from "../../permissions";
import { FeedbackError, FeedbackLoading, FeedbackNotFound } from "./shared";

const Board = lazy(() =>
	import("./pages/feedback-page.internal").then((m) => ({
		default: m.FeedbackBoardPage,
	})),
);
const Post = lazy(() =>
	import("./pages/post-page.internal").then((m) => ({
		default: m.FeedbackPostPage,
	})),
);
const Roadmap = lazy(() =>
	import("./pages/roadmap-page.internal").then((m) => ({
		default: m.FeedbackRoadmapPage,
	})),
);
const Changelog = lazy(() =>
	import("./pages/changelog-page.internal").then((m) => ({
		default: m.FeedbackChangelogPage,
	})),
);
const boundary = {
	ErrorComponent: FeedbackError,
	LoadingComponent: FeedbackLoading,
	NotFoundComponent: FeedbackNotFound,
	onError: (error: Error) => console.error("[btst/feedback]", error),
};

export function FeedbackPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/feedback"
			permission={feedbackPermissions.post.read({ scope: "collection" })}
			PageComponent={Board}
		/>
	);
}
function AuthorizedPost({ slug }: { slug: string }) {
	const { data: post } = useFeedbackPost(slug);
	return (
		<PermissionRouteAccess
			permission={feedbackPermissions.post.read({
				scope: "record",
				postId: post.id,
				slug: post.slug,
			})}
			LoadingComponent={FeedbackLoading}
		>
			<Post slug={slug} />
		</PermissionRouteAccess>
	);
}
export function FeedbackPostPageComponent({ slug }: { slug: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/feedback/${slug}`}
			PageComponent={AuthorizedPost}
			props={{ slug }}
		/>
	);
}
export function FeedbackRoadmapPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/feedback/roadmap"
			permission={feedbackPermissions.post.read({ scope: "collection" })}
			PageComponent={Roadmap}
		/>
	);
}
export function FeedbackChangelogPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/feedback/changelog"
			permission={feedbackPermissions.changelog.read()}
			PageComponent={Changelog}
		/>
	);
}
