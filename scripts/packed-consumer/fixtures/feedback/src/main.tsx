import { feedbackClientPlugin } from "@btst/plugin-feedback/client";
import {
	FeedbackPageComponent,
	FeedbackPostPageComponent,
	FeedbackRoadmapPageComponent,
	FeedbackChangelogPageComponent,
} from "@btst/plugin-feedback/client/components";
import { feedbackPermissions } from "@btst/plugin-feedback/permissions";
import "@btst/plugin-feedback/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";
const post = {
	id: "packed-post",
	slug: "packed-feedback",
	title: "Packed feedback",
	body: "Vote for a better developer experience",
	category: "Developer tools",
	status: "shipped" as const,
	authorId: "author",
	voteCount: 8,
	isVoted: false,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};
globalThis.fetch = async (input, init) => {
	const url = new URL(String(input));
	if (url.pathname.endsWith("/vote")) {
		post.isVoted = !post.isVoted;
		post.voteCount += post.isVoted ? 1 : -1;
		localStorage.setItem("feedback-vote", String(post.voteCount));
		return Response.json({ voteCount: post.voteCount, isVoted: post.isVoted });
	}
	if (url.pathname.endsWith("/feedback/posts/packed-feedback"))
		return Response.json(post);
	if (url.pathname.endsWith("/feedback/posts")) {
		const matches =
			!url.searchParams.get("category") ||
			url.searchParams.get("category") === post.category;
		return Response.json({
			items: matches ? [post] : [],
			total: matches ? 1 : 0,
		});
	}
	if (url.pathname.endsWith("/feedback/roadmap"))
		return Response.json({ planned: [], in_progress: [], shipped: [post] });
	if (url.pathname.endsWith("/feedback/changelog"))
		return Response.json({
			items: [
				{
					id: "release",
					title: "Packed release",
					body: "Now available",
					publishedAt: post.createdAt,
					createdAt: post.createdAt,
					posts: [post],
				},
			],
			total: 1,
		});
	throw new Error(`Unexpected request ${input} ${init?.method}`);
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { feedback: feedbackClientPlugin() },
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [feedbackPermissions],
	rules: ({ feedback: f }) => [
		f.post.read.allow(),
		f.post.vote.allow(),
		f.changelog.read.allow(),
	],
});
const identity = { id: "reader" };
const mode = new URLSearchParams(location.search).get("mode");
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({ authorization, getIdentity: () => identity })}
			initialIdentity={identity}
			overrides={{
				feedback: { postBottomSlot: () => <p>Application discussion slot</p> },
			}}
		>
			{mode === "detail" ? (
				<FeedbackPostPageComponent slug="packed-feedback" />
			) : mode === "roadmap" ? (
				<FeedbackRoadmapPageComponent />
			) : mode === "changelog" ? (
				<FeedbackChangelogPageComponent />
			) : (
				<FeedbackPageComponent />
			)}
		</StackProvider>
	</QueryClientProvider>,
);
