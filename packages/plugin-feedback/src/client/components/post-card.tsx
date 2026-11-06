"use client";

import { useState } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import type { FeedbackPost } from "../../types";
import { feedbackPermissions } from "../../permissions";
import { useToggleFeedbackVote } from "../hooks";
import type { FeedbackPluginOverrides } from "../overrides";
import { FEEDBACK_PLUGIN_ID } from "../constants";
import { FeedbackStatusLabel } from "./shared";

export function FeedbackVoteButton({ post }: { post: FeedbackPost }) {
	const vote = useToggleFeedbackVote();
	const [error, setError] = useState("");
	return (
		<div className="space-y-1">
			<PermissionAccess
				permission={feedbackPermissions.post.vote({
					postId: post.id,
					status: post.status,
					authorId: post.authorId,
				})}
				fallback={
					<span className="text-sm text-muted-foreground">
						{post.voteCount} votes
					</span>
				}
			>
				<Button
					variant={post.isVoted ? "default" : "outline"}
					aria-pressed={post.isVoted}
					aria-label={`${post.isVoted ? "Remove vote for" : "Vote for"} ${post.title}`}
					disabled={vote.isPending}
					onClick={async () => {
						setError("");
						try {
							await vote.mutateAsync({ id: post.id });
						} catch (caught) {
							setError(
								caught instanceof Error
									? caught.message
									: "Vote could not be saved.",
							);
						}
					}}
				>
					{post.voteCount} {post.voteCount === 1 ? "vote" : "votes"}
				</Button>
			</PermissionAccess>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}

export function FeedbackPostCard({
	page,
	post,
}: {
	page?: "feedback" | "feedbackRoadmap";
	post: FeedbackPost;
}) {
	const { pageOverrides } =
		usePluginOverrides<FeedbackPluginOverrides>(FEEDBACK_PLUGIN_ID);
	const Component = page ? pageOverrides?.[page]?.PostCard : undefined;
	return Component ? (
		<Component post={post} />
	) : (
		<DefaultFeedbackPostCard post={post} />
	);
}

function DefaultFeedbackPostCard({ post }: { post: FeedbackPost }) {
	const { Link, resolve } = usePluginSiteNavigation(FEEDBACK_PLUGIN_ID);
	return (
		<article
			className="flex min-w-0 flex-wrap items-start gap-4 rounded-lg border p-5"
			data-testid="feedback-post-card"
		>
			<FeedbackVoteButton post={post} />
			<div className="min-w-0 flex-1 space-y-3">
				<h2 className="break-words text-lg font-semibold">
					<Link
						href={resolve(`feedback/${encodeURIComponent(post.slug)}`).href}
						className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
					>
						{post.title}
					</Link>
				</h2>
				<p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
					{post.body}
				</p>
				<div className="flex flex-wrap items-center gap-3">
					<FeedbackStatusLabel status={post.status} />
					{post.category && (
						<span className="text-sm text-muted-foreground">
							{post.category}
						</span>
					)}
				</div>
			</div>
		</article>
	);
}
