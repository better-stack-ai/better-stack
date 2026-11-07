"use client";

import { useState } from "react";
import {
	PermissionAccess,
	useBasePath,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Label } from "@workspace/ui/components/label";
import { blogPermissions } from "../../permissions";
import type { SerializedEditorialPost } from "../../types";
import {
	useApprovePost,
	usePublishPost,
	useRequestPostChanges,
	useSubmitPost,
} from "../hooks/blog-hooks";
import { BLOG_PLUGIN_ID } from "../constants";
import { BLOG_EDITORIAL } from "../localization/blog-editorial";
import type { BlogPluginOverrides } from "../overrides";

export function EditorialReview({
	post,
	unsaved,
	disabled,
	onReload,
}: {
	post: SerializedEditorialPost;
	unsaved: boolean;
	disabled: boolean;
	onReload: () => Promise<unknown>;
}) {
	const t = useTranslate();
	const basePath = useBasePath();
	const { localization } =
		usePluginOverrides<BlogPluginOverrides>(BLOG_PLUGIN_ID);
	const label = (key: keyof typeof BLOG_EDITORIAL) =>
		localization?.[key] ??
		t(
			`blog.editorial.${key
				.replace("BLOG_EDITORIAL_", "")
				.toLowerCase()
				.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}`,
			BLOG_EDITORIAL[key],
		);
	const submit = useSubmitPost();
	const requestChanges = useRequestPostChanges();
	const approve = useApprovePost();
	const publish = usePublishPost();
	const [comment, setComment] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [conflict, setConflict] = useState(false);
	const state = post.editorial;
	const facts = {
		id: post.id,
		...(post.authorId ? { authorId: post.authorId } : {}),
		revisionVersion: post.revisionVersion ?? 0,
		editorialVersion: state.version,
		status: state.status,
	};
	const input = {
		id: post.id,
		expectedVersion: post.revisionVersion ?? 0,
		expectedEditorialVersion: state.version,
	};
	const pending =
		submit.isPending ||
		requestChanges.isPending ||
		approve.isPending ||
		publish.isPending;
	const blocked = disabled || unsaved || pending;
	const run = async (action: () => Promise<unknown>) => {
		setError(null);
		setConflict(false);
		try {
			await action();
			setComment("");
		} catch (caught) {
			const stale =
				!!caught &&
				typeof caught === "object" &&
				"statusCode" in caught &&
				caught.statusCode === 409;
			setConflict(stale);
			setError(
				stale
					? label("BLOG_EDITORIAL_CONFLICT")
					: caught instanceof Error
						? caught.message
						: label("BLOG_EDITORIAL_ERROR"),
			);
		}
	};
	const statusLabel = {
		draft: "BLOG_EDITORIAL_DRAFT",
		submitted: "BLOG_EDITORIAL_SUBMITTED",
		"changes-requested": "BLOG_EDITORIAL_CHANGES_REQUESTED",
		approved: "BLOG_EDITORIAL_APPROVED",
	} as const;
	return (
		<section
			aria-label={label("BLOG_EDITORIAL_TITLE")}
			data-testid="editorial-review"
			className="space-y-3 rounded-md border p-4"
		>
			<h2 className="font-semibold">{label("BLOG_EDITORIAL_TITLE")}</h2>
			<p role="status">
				{label(statusLabel[state.status])} ·{" "}
				{label("BLOG_EDITORIAL_VERSION").replace(
					"{version}",
					String(post.revisionVersion ?? 0),
				)}
			</p>
			{(state.actorId || state.updatedAt) && (
				<p className="text-sm text-muted-foreground">
					{label("BLOG_EDITORIAL_ACTOR")}:{" "}
					{state.actorId ?? label("BLOG_EDITORIAL_SYSTEM")}
					{state.updatedAt && (
						<>
							{" "}
							·{" "}
							<time dateTime={state.updatedAt}>
								{new Date(state.updatedAt).toISOString()}
							</time>
						</>
					)}
				</p>
			)}
			{state.comment && (
				<p className="whitespace-pre-wrap break-words text-sm">
					{state.comment}
				</p>
			)}
			<p className="text-sm text-muted-foreground">
				{label("BLOG_EDITORIAL_PRIVATE")}
			</p>
			{state.liveSlug && (
				<a
					className="text-sm underline"
					href={`${basePath}/blog/${state.liveSlug}`}
				>
					{label("BLOG_EDITORIAL_VIEW_LIVE")}
				</a>
			)}
			{unsaved && (
				<p className="text-sm text-muted-foreground">
					{label("BLOG_EDITORIAL_UNSAVED")}
				</p>
			)}
			{error && (
				<div role="alert" className="space-y-2 text-sm text-destructive">
					<p>{error}</p>
					{conflict && (
						<Button
							type="button"
							variant="outline"
							disabled={pending || disabled}
							onClick={() => void run(onReload)}
						>
							{label("BLOG_EDITORIAL_REFRESH")}
						</Button>
					)}
				</div>
			)}
			<div className="flex flex-wrap gap-2">
				{(state.status === "draft" || state.status === "changes-requested") && (
					<PermissionAccess permission={blogPermissions.post.submit(facts)}>
						<Button
							type="button"
							disabled={blocked}
							onClick={() => void run(() => submit.mutateAsync(input))}
						>
							{label("BLOG_EDITORIAL_SUBMIT")}
						</Button>
					</PermissionAccess>
				)}
				{(state.status === "submitted" || state.status === "approved") && (
					<PermissionAccess
						permission={blogPermissions.post.requestChanges(facts)}
					>
						<div className="w-full space-y-2">
							<Label htmlFor={`review-comment-${post.id}`}>
								{label("BLOG_EDITORIAL_COMMENT")}
							</Label>
							<Textarea
								id={`review-comment-${post.id}`}
								value={comment}
								maxLength={2000}
								disabled={blocked}
								onChange={(event) => setComment(event.target.value)}
							/>
							<Button
								type="button"
								variant="outline"
								disabled={blocked}
								onClick={() =>
									void run(() =>
										requestChanges.mutateAsync({ ...input, comment }),
									)
								}
							>
								{label("BLOG_EDITORIAL_REQUEST_CHANGES")}
							</Button>
						</div>
					</PermissionAccess>
				)}
				{state.status === "submitted" && (
					<PermissionAccess permission={blogPermissions.post.approve(facts)}>
						<Button
							type="button"
							disabled={blocked}
							onClick={() => void run(() => approve.mutateAsync(input))}
						>
							{label("BLOG_EDITORIAL_APPROVE")}
						</Button>
					</PermissionAccess>
				)}
				{state.status === "approved" &&
					(!post.published ||
						state.liveRevisionId !== state.approvedRevisionId) && (
						<PermissionAccess
							permission={blogPermissions.post.publish({
								...facts,
								published: true,
							})}
						>
							<Button
								type="button"
								disabled={blocked}
								onClick={() =>
									void run(() =>
										publish.mutateAsync({ ...input, published: true }),
									)
								}
							>
								{label("BLOG_EDITORIAL_PUBLISH")}
							</Button>
						</PermissionAccess>
					)}
				{post.published && (
					<PermissionAccess
						permission={blogPermissions.post.publish({
							...facts,
							published: false,
						})}
					>
						<Button
							type="button"
							variant="outline"
							disabled={blocked}
							onClick={() =>
								void run(() =>
									publish.mutateAsync({ ...input, published: false }),
								)
							}
						>
							{label("BLOG_EDITORIAL_UNPUBLISH")}
						</Button>
					</PermissionAccess>
				)}
			</div>
		</section>
	);
}
