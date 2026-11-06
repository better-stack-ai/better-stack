"use client";

import { useState } from "react";
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
import { useTranslate } from "@btst/stack/context";
import { useContentRevisions, useRestoreContentRevision } from "../hooks";
import type { SerializedContentRevision } from "../../types";

export function RevisionHistory({
	typeSlug,
	itemId,
	onRestored,
}: {
	typeSlug: string;
	itemId: string;
	onRestored: () => void;
}) {
	const t = useTranslate();
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<SerializedContentRevision | null>(
		null,
	);
	const [restoreError, setRestoreError] = useState<string | null>(null);
	const history = useContentRevisions(typeSlug, itemId, open);
	const restore = useRestoreContentRevision();
	const restoreSelected = async () => {
		if (!selected) return;
		setRestoreError(null);
		try {
			await restore.mutateAsync({
				typeSlug,
				id: itemId,
				revisionId: selected.id,
			});
			onRestored();
			setSelected(null);
			setOpen(false);
		} catch (error) {
			setRestoreError(
				error instanceof Error
					? error.message
					: t("cms.revisions.restoreError", "Could not restore revision"),
			);
		}
	};

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button variant="outline">
					{t("cms.revisions.title", "Revision history")}
				</Button>
			</SheetTrigger>
			<SheetContent className="w-full overflow-y-auto sm:max-w-lg">
				<SheetHeader>
					<SheetTitle>
						{t("cms.revisions.title", "Revision history")}
					</SheetTitle>
					<SheetDescription>
						{t(
							"cms.revisions.description",
							"Inspect saved versions. Restoring a version replaces the editor state and creates a new revision.",
						)}
					</SheetDescription>
				</SheetHeader>
				<div className="space-y-4 px-4 pb-6">
					{history.isLoading && (
						<p role="status">
							{t("cms.revisions.loading", "Loading revisions...")}
						</p>
					)}
					{history.error && (
						<div role="alert" className="space-y-2">
							<p className="text-destructive">{history.error.message}</p>
							<Button variant="outline" onClick={() => void history.refetch()}>
								{t("cms.revisions.retry", "Retry")}
							</Button>
						</div>
					)}
					{!history.isLoading &&
						!history.error &&
						history.revisions.length === 0 && (
							<p className="text-muted-foreground">
								{t(
									"cms.revisions.empty",
									"No revisions yet. Saving this entry will create its first revision.",
								)}
							</p>
						)}
					{history.revisions.map((revision) => (
						<details key={revision.id} className="rounded-md border p-3">
							<summary className="cursor-pointer space-y-1 break-words">
								<span className="font-medium">
									{t("cms.revisions.version", "Version {version}").replace(
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
									{t("cms.revisions.author", "Author")}:{" "}
									{revision.authorId ?? t("cms.revisions.system", "System")}
								</span>
							</summary>
							<div className="mt-3 space-y-3 text-sm">
								<p className="break-words">
									{t("cms.common.slugLabel", "Slug")}: {revision.slug}
								</p>
								<p>
									{t("cms.editor.publishAt", "Publish at")}:{" "}
									{revision.publishAt
										? new Date(revision.publishAt).toLocaleString()
										: t("cms.revisions.unscheduled", "Not scheduled")}
								</p>
								<pre
									className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs"
									aria-label={t("cms.revisions.snapshot", "Field snapshot")}
								>
									{JSON.stringify(JSON.parse(revision.data), null, 2)}
								</pre>
								<Button
									variant="outline"
									disabled={restore.isPending}
									onClick={() => {
										setRestoreError(null);
										setSelected(revision);
									}}
								>
									{t("cms.revisions.restore", "Restore this version")}
								</Button>
							</div>
						</details>
					))}
					{history.hasNextPage && (
						<Button
							variant="outline"
							disabled={history.isFetchingNextPage}
							onClick={() => void history.fetchNextPage()}
						>
							{t("cms.revisions.loadMore", "Load older revisions")}
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
							{t(
								"cms.revisions.confirmTitle",
								"Restore version {version}?",
							).replace("{version}", String(selected?.version ?? ""))}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								"cms.revisions.confirmDescription",
								"This replaces the active entry, including its slug and schedule. Unsaved editor changes will be discarded. Existing revisions are kept.",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{restoreError && (
						<p role="alert" className="text-sm text-destructive">
							{restoreError}
						</p>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={restore.isPending}>
							{t("cms.common.cancel", "Cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={restore.isPending}
							onClick={(event) => {
								event.preventDefault();
								void restoreSelected();
							}}
						>
							{restore.isPending
								? t("cms.revisions.restoring", "Restoring...")
								: t("cms.revisions.confirm", "Restore version")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Sheet>
	);
}
