"use client";

import { useId, useState } from "react";
import { PermissionAccess, usePluginOverrides } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { feedbackPermissions } from "../../../permissions";
import type { FeedbackPost, FeedbackStatus } from "../../../types";
import { useFeedbackPost, useUpdateFeedbackStatus } from "../../hooks";
import { FEEDBACK_PLUGIN_ID } from "../../constants";
import type { FeedbackPluginOverrides } from "../../overrides";
import { FeedbackVoteButton } from "../post-card";
import {
	FeedbackPage,
	FeedbackStatusLabel,
	Field,
	selectClass,
	statusLabels,
} from "../shared";

function StatusEditor({ post }: { post: FeedbackPost }) {
	const id = useId();
	const [status, setStatus] = useState(post.status);
	const [error, setError] = useState("");
	const update = useUpdateFeedbackStatus();
	return (
		<form
			className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
			onSubmit={async (event) => {
				event.preventDefault();
				setError("");
				try {
					await update.mutateAsync({ id: post.id, status });
				} catch (caught) {
					setError(
						caught instanceof Error
							? caught.message
							: "Status could not be updated.",
					);
				}
			}}
		>
			<Field id={id} label="Request status">
				<select
					id={id}
					className={selectClass}
					value={status}
					onChange={(event) => setStatus(event.target.value as FeedbackStatus)}
				>
					{Object.entries(statusLabels).map(([value, label]) => (
						<option key={value} value={value}>
							{label}
						</option>
					))}
				</select>
			</Field>
			<Button
				type="submit"
				disabled={update.isPending || status === post.status}
			>
				Update status
			</Button>
			{error && (
				<p role="alert" className="w-full text-destructive">
					{error}
				</p>
			)}
		</form>
	);
}

export function FeedbackPostPage({ slug }: { slug: string }) {
	const { data: post } = useFeedbackPost(slug);
	const overrides =
		usePluginOverrides<FeedbackPluginOverrides>(FEEDBACK_PLUGIN_ID);
	return (
		<FeedbackPage title={post.title}>
			<div className="flex flex-wrap items-center gap-4">
				<FeedbackVoteButton post={post} />
				<FeedbackStatusLabel status={post.status} />
				{post.category && (
					<span className="text-muted-foreground">{post.category}</span>
				)}
			</div>
			<p className="whitespace-pre-wrap break-words leading-7">{post.body}</p>
			<PermissionAccess
				permission={feedbackPermissions.post.updateStatus({
					postId: post.id,
					status: post.status,
					authorId: post.authorId,
				})}
			>
				<StatusEditor key={`${post.id}:${post.status}`} post={post} />
			</PermissionAccess>
			{overrides.kanbanTaskSlot && (
				<PermissionAccess
					permission={feedbackPermissions.post.linkKanbanTask({
						postId: post.id,
						status: post.status,
						authorId: post.authorId,
					})}
				>
					{overrides.kanbanTaskSlot(post)}
				</PermissionAccess>
			)}
			{overrides.postBottomSlot && <div>{overrides.postBottomSlot(post)}</div>}
		</FeedbackPage>
	);
}
