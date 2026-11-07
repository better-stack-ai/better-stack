"use client";

import { useState } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@workspace/ui/components/sheet";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import type { SerializedPost, SerializedPostRevision } from "../../types";
import { blogPermissions } from "../../permissions";
import { usePostRevisions, useRestorePostRevision } from "../hooks/blog-hooks";
import { BLOG_PLUGIN_ID } from "../constants";
import { BLOG_REVISIONS } from "../localization/blog-revisions";
import type { BlogPluginOverrides } from "../overrides";

export function RevisionHistory({
	post,
	disabled,
	onRestored,
}: {
	post: SerializedPost;
	disabled?: boolean;
	onRestored: (post: SerializedPost) => void;
}) {
	const t = useTranslate();
	const { localization } =
		usePluginOverrides<BlogPluginOverrides>(BLOG_PLUGIN_ID);
	const label = (key: keyof typeof BLOG_REVISIONS) =>
		localization?.[key] ??
		t(
			`blog.revisions.${key
				.replace("BLOG_REVISIONS_", "")
				.toLowerCase()
				.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())}`,
			BLOG_REVISIONS[key],
		);
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<SerializedPostRevision | null>(null);
	const [restoreError, setRestoreError] = useState<string | null>(null);
	const history = usePostRevisions(post.id, open);
	const restore = useRestorePostRevision();
	const restoreSelected = async () => {
		if (!selected) return;
		setRestoreError(null);
		try {
			const restored = await restore.mutateAsync({
				id: post.id,
				revisionId: selected.id,
				expectedVersion: post.revisionVersion ?? 0,
			});
			setSelected(null);
			setOpen(false);
			onRestored(restored);
		} catch (error) {
			setRestoreError(
				error &&
					typeof error === "object" &&
					"statusCode" in error &&
					error.statusCode === 409
					? label("BLOG_REVISIONS_CONFLICT")
					: error instanceof Error
						? error.message
						: label("BLOG_REVISIONS_RESTORE_ERROR"),
			);
		}
	};

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" disabled={disabled}>
					{label("BLOG_REVISIONS_TITLE")}
				</Button>
			</SheetTrigger>
			<SheetContent className="w-full overflow-y-auto sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>{label("BLOG_REVISIONS_TITLE")}</SheetTitle>
					<SheetDescription>
						{label("BLOG_REVISIONS_DESCRIPTION")}
					</SheetDescription>
				</SheetHeader>
				<div className="space-y-4 px-4 pb-6">
					{history.isLoading && (
						<p role="status">{label("BLOG_REVISIONS_LOADING")}</p>
					)}
					{history.error && (
						<div role="alert" className="space-y-2">
							<p className="text-destructive">{history.error.message}</p>
							<Button variant="outline" onClick={() => void history.refetch()}>
								{label("BLOG_REVISIONS_RETRY")}
							</Button>
						</div>
					)}
					{!history.isLoading &&
						!history.error &&
						history.revisions.length === 0 && (
							<p className="text-muted-foreground">
								{label("BLOG_REVISIONS_EMPTY")}
							</p>
						)}
					{history.revisions.map((revision) => (
						<details key={revision.id} className="rounded-md border p-3">
							<summary className="cursor-pointer space-y-1 break-words">
								<span className="font-medium">
									{label("BLOG_REVISIONS_VERSION").replace(
										"{version}",
										String(revision.version),
									)}
								</span>
								<span className="block text-sm text-muted-foreground">
									<time dateTime={revision.createdAt}>
										{new Date(revision.createdAt).toLocaleString()}
									</time>
								</span>
								<span className="block text-sm text-muted-foreground">
									{label("BLOG_REVISIONS_ACTOR")}:{" "}
									{revision.actorId ?? label("BLOG_REVISIONS_SYSTEM")}
								</span>
							</summary>
							<div className="mt-3 space-y-3 text-sm">
								<p className="break-words font-medium">{revision.title}</p>
								<dl className="space-y-2 break-words">
									<div>
										<dt className="font-medium">
											{localization?.BLOG_FORMS_SLUG_LABEL ??
												t("blog.forms.slugLabel", "Slug")}
										</dt>
										<dd>{revision.slug}</dd>
									</div>
									<div>
										<dt className="font-medium">
											{localization?.BLOG_FORMS_EXCERPT_LABEL ??
												t("blog.forms.excerptLabel", "Excerpt")}
										</dt>
										<dd className="whitespace-pre-wrap">{revision.excerpt}</dd>
									</div>
									<div>
										<dt className="font-medium">
											{localization?.BLOG_FORMS_TAGS_LABEL ??
												t("blog.forms.tagsLabel", "Tags")}
										</dt>
										<dd>
											{revision.tags.map((tag) => tag.name).join(", ") ||
												label("BLOG_REVISIONS_NONE")}
										</dd>
									</div>
									<div>
										<dt className="font-medium">
											{localization?.BLOG_FORMS_FEATURED_IMAGE_LABEL ??
												t("blog.forms.featuredImageLabel", "Image")}
										</dt>
										<dd>{revision.image || label("BLOG_REVISIONS_NONE")}</dd>
									</div>
									<div>
										<dt className="font-medium">
											{localization?.BLOG_FORMS_PUBLISHED_LABEL ??
												t("blog.forms.publishedLabel", "Published")}
										</dt>
										<dd>
											{label(
												revision.published
													? "BLOG_REVISIONS_PUBLISHED"
													: "BLOG_REVISIONS_DRAFT",
											)}
											{revision.publishedAt && (
												<>
													{" "}
													<time dateTime={revision.publishedAt}>
														{new Date(revision.publishedAt).toLocaleString()}
													</time>
												</>
											)}
										</dd>
									</div>
								</dl>
								<div className="space-y-1">
									<p className="font-medium">
										{localization?.BLOG_FORMS_CONTENT_LABEL ??
											t("blog.forms.contentLabel", "Content")}
									</p>
									<div
										className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3"
										aria-label={label("BLOG_REVISIONS_SNAPSHOT")}
									>
										{revision.content}
									</div>
								</div>
								<PermissionAccess
									permission={blogPermissions.post.restore({
										id: post.id,
										...(post.authorId ? { authorId: post.authorId } : {}),
									})}
								>
									<Button
										variant="outline"
										disabled={restore.isPending || disabled}
										onClick={() => {
											setRestoreError(null);
											setSelected(revision);
										}}
									>
										{label("BLOG_REVISIONS_RESTORE")}
									</Button>
								</PermissionAccess>
							</div>
						</details>
					))}
					{history.hasNextPage && (
						<Button
							variant="outline"
							disabled={history.isFetchingNextPage}
							onClick={() => void history.fetchNextPage()}
						>
							{label("BLOG_REVISIONS_LOAD_MORE")}
						</Button>
					)}
				</div>
			</SheetContent>
			<AlertDialog
				open={!!selected}
				onOpenChange={(value) => {
					if (!value && !restore.isPending) setSelected(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{label("BLOG_REVISIONS_CONFIRM_TITLE").replace(
								"{version}",
								String(selected?.version ?? ""),
							)}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{label("BLOG_REVISIONS_CONFIRM_DESCRIPTION")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{restoreError && (
						<p role="alert" className="text-sm text-destructive">
							{restoreError}
						</p>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={restore.isPending}>
							{label("BLOG_REVISIONS_CANCEL")}
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={restore.isPending || disabled}
							onClick={(event) => {
								event.preventDefault();
								void restoreSelected();
							}}
						>
							{label(
								restore.isPending
									? "BLOG_REVISIONS_RESTORING"
									: "BLOG_REVISIONS_CONFIRM",
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Sheet>
	);
}
