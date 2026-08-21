"use client";

import { useState } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@workspace/ui/components/table";
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
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import { Trash2, ExternalLink, LogIn, MessageSquareOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNotify, useStack, useTranslate } from "@btst/stack/context";
import { useListState, type ListStateSchema } from "@btst/stack/client";
import type { CommentsPluginOverrides } from "../../overrides";
import { PaginationControls } from "@workspace/ui/components/pagination-controls";
import type { SerializedComment, CommentStatus } from "../../../types";
import {
	useSuspenseComments,
	useDeleteComment,
} from "../../hooks/use-comments";
import type { CommentsLocalization } from "../../localization";
import { getInitials, useCurrentUserId } from "../../utils";

const PAGE_LIMIT = 20;

// URL-synced pagination: the page number survives reloads and is undoable
// with the back button (discrete changes default to push history).
const LIST_STATE_SCHEMA = {
	page: { type: "number", default: 1 },
} as const satisfies ListStateSchema;

interface UserCommentsPageProps {
	resourceLinks?: CommentsPluginOverrides["resourceLinks"];
	localization?: Partial<CommentsLocalization>;
}

function StatusBadge({
	status,
	localization,
}: {
	status: CommentStatus;
	localization?: Partial<CommentsLocalization>;
}) {
	const t = useTranslate();
	if (status === "approved") {
		return (
			<Badge variant="outline" className="text-green-700 border-green-300">
				{localization?.COMMENTS_MY_STATUS_APPROVED ??
					t("comments.my.statusApproved", "Approved")}
			</Badge>
		);
	}
	if (status === "pending") {
		return (
			<Badge variant="outline" className="text-yellow-700 border-yellow-300">
				{localization?.COMMENTS_MY_STATUS_PENDING ??
					t("comments.my.statusPending", "Pending")}
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-red-700 border-red-300">
			{localization?.COMMENTS_MY_STATUS_SPAM ??
				t("comments.my.statusSpam", "Spam")}
		</Badge>
	);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function UserCommentsPage({
	resourceLinks,
	localization,
}: UserCommentsPageProps) {
	const t = useTranslate();
	const { api } = useStack();
	const { currentUserId: resolvedUserId, isPending: isIdentityPending } =
		useCurrentUserId();

	if (isIdentityPending) {
		return (
			<div
				className="space-y-3 py-20 animate-pulse"
				data-testid="my-comments-identity-loading"
			>
				<div className="h-6 w-48 mx-auto rounded bg-muted" />
				<div className="h-4 w-64 mx-auto rounded bg-muted" />
			</div>
		);
	}

	if (!resolvedUserId) {
		return (
			<div
				className="flex flex-col items-center justify-center gap-4 py-20 text-center"
				data-testid="my-comments-login-prompt"
			>
				<LogIn className="h-10 w-10 text-muted-foreground" />
				<p className="text-lg font-medium">
					{localization?.COMMENTS_MY_LOGIN_TITLE ??
						t("comments.my.loginTitle", "Please log in to view your comments")}
				</p>
				<p className="text-sm text-muted-foreground">
					{localization?.COMMENTS_MY_LOGIN_DESCRIPTION ??
						t(
							"comments.my.loginDescription",
							"You need to be logged in to see your comment history.",
						)}
				</p>
			</div>
		);
	}

	return (
		<UserCommentsList
			apiBaseURL={api?.baseURL ?? ""}
			apiBasePath={api?.basePath ?? ""}
			currentUserId={resolvedUserId}
			resourceLinks={resourceLinks}
			localization={localization}
		/>
	);
}

// ─── List (suspense boundary is in ComposedRoute) ─────────────────────────────

function UserCommentsList({
	apiBaseURL,
	apiBasePath,
	currentUserId,
	resourceLinks,
	localization,
}: {
	apiBaseURL: string;
	apiBasePath: string;
	currentUserId: string;
	resourceLinks?: CommentsPluginOverrides["resourceLinks"];
	localization?: Partial<CommentsLocalization>;
}) {
	const t = useTranslate();
	const notify = useNotify();

	const [listState, setListState] = useListState(
		"comments-my",
		LIST_STATE_SCHEMA,
	);
	// Clamp the URL-sourced page so a mangled URL cannot produce an invalid query.
	const page = Math.max(1, Math.floor(listState.page) || 1);

	const [deleteId, setDeleteId] = useState<string | null>(null);

	const config = { apiBaseURL, apiBasePath };
	const offset = (page - 1) * PAGE_LIMIT;

	const { comments, total, refetch } = useSuspenseComments(config, {
		authorId: currentUserId,
		sort: "desc",
		limit: PAGE_LIMIT,
		offset,
	});

	const deleteMutation = useDeleteComment(config);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

	const handleDelete = async () => {
		if (!deleteId) return;
		try {
			await deleteMutation.mutateAsync(deleteId);
			notify.success(
				localization?.COMMENTS_MY_TOAST_DELETED ??
					t("comments.my.toastDeleted", "Comment deleted"),
			);
			refetch();
		} catch {
			notify.error(
				localization?.COMMENTS_MY_TOAST_DELETE_ERROR ??
					t("comments.my.toastDeleteError", "Failed to delete comment"),
			);
		} finally {
			setDeleteId(null);
		}
	};

	if (comments.length === 0 && page === 1) {
		return (
			<div
				className="flex flex-col items-center justify-center gap-4 py-20 text-center"
				data-testid="my-comments-empty"
			>
				<MessageSquareOff className="h-10 w-10 text-muted-foreground" />
				<p className="text-lg font-medium">
					{localization?.COMMENTS_MY_EMPTY_TITLE ??
						t("comments.my.emptyTitle", "No comments yet")}
				</p>
				<p className="text-sm text-muted-foreground">
					{localization?.COMMENTS_MY_EMPTY_DESCRIPTION ??
						t(
							"comments.my.emptyDescription",
							"Comments you post will appear here.",
						)}
				</p>
			</div>
		);
	}

	return (
		<div data-testid="my-comments-page" className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">
					{localization?.COMMENTS_MY_PAGE_TITLE ??
						t("comments.my.pageTitle", "My Comments")}
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{total}{" "}
					{(
						localization?.COMMENTS_MY_COL_COMMENT ??
						t("comments.my.colComment", "Comment")
					).toLowerCase()}
					{total !== 1 ? "s" : ""}
				</p>
			</div>

			<div
				className="rounded-lg border overflow-hidden"
				data-testid="my-comments-list"
			>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-10" />
							<TableHead>
								{localization?.COMMENTS_MY_COL_COMMENT ??
									t("comments.my.colComment", "Comment")}
							</TableHead>
							<TableHead className="hidden sm:table-cell w-32">
								{localization?.COMMENTS_MY_COL_RESOURCE ??
									t("comments.my.colResource", "Resource")}
							</TableHead>
							<TableHead className="w-28">
								{localization?.COMMENTS_MY_COL_STATUS ??
									t("comments.my.colStatus", "Status")}
							</TableHead>
							<TableHead className="hidden md:table-cell w-36">
								{localization?.COMMENTS_MY_COL_DATE ??
									t("comments.my.colDate", "Date")}
							</TableHead>
							<TableHead className="w-16" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{comments.map((comment) => (
							<CommentRow
								key={comment.id}
								comment={comment}
								resourceLinks={resourceLinks}
								localization={localization}
								onDelete={() => setDeleteId(comment.id)}
								isDeleting={deleteMutation.isPending && deleteId === comment.id}
							/>
						))}
					</TableBody>
				</Table>

				<PaginationControls
					currentPage={page}
					totalPages={totalPages}
					total={total}
					limit={PAGE_LIMIT}
					offset={offset}
					onPageChange={(p) => {
						setListState({ page: p });
						window.scrollTo({ top: 0, behavior: "smooth" });
					}}
				/>
			</div>

			<AlertDialog
				open={!!deleteId}
				onOpenChange={(open) => !open && setDeleteId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{localization?.COMMENTS_MY_DELETE_TITLE ??
								t("comments.my.deleteTitle", "Delete comment?")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{localization?.COMMENTS_MY_DELETE_DESCRIPTION ??
								t(
									"comments.my.deleteDescription",
									"This action cannot be undone. The comment will be permanently removed.",
								)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{localization?.COMMENTS_MY_DELETE_CANCEL ??
								t("comments.my.deleteCancel", "Cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{localization?.COMMENTS_MY_DELETE_CONFIRM ??
								t("comments.my.deleteConfirm", "Delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function CommentRow({
	comment,
	resourceLinks,
	localization,
	onDelete,
	isDeleting,
}: {
	comment: SerializedComment;
	resourceLinks?: CommentsPluginOverrides["resourceLinks"];
	localization?: Partial<CommentsLocalization>;
	onDelete: () => void;
	isDeleting: boolean;
}) {
	const t = useTranslate();
	const resourceUrlBase = resourceLinks?.[comment.resourceType]?.(
		comment.resourceId,
	);
	const resourceUrl = resourceUrlBase
		? `${resourceUrlBase}#comments`
		: undefined;

	return (
		<TableRow data-testid="my-comment-row">
			<TableCell>
				<Avatar className="h-7 w-7">
					{comment.resolvedAvatarUrl && (
						<AvatarImage
							src={comment.resolvedAvatarUrl}
							alt={comment.resolvedAuthorName}
						/>
					)}
					<AvatarFallback className="text-xs">
						{getInitials(comment.resolvedAuthorName)}
					</AvatarFallback>
				</Avatar>
			</TableCell>

			<TableCell className="max-w-xs">
				<p className="text-sm line-clamp-2">{comment.body}</p>
				{comment.parentId && (
					<span className="text-xs text-muted-foreground mt-0.5 block">
						{localization?.COMMENTS_MY_REPLY_INDICATOR ??
							t("comments.my.replyIndicator", "↩ Reply")}
					</span>
				)}
			</TableCell>

			<TableCell className="hidden sm:table-cell">
				<div className="flex flex-col gap-0.5">
					<span className="text-xs font-medium text-muted-foreground capitalize">
						{comment.resourceType.replace(/-/g, " ")}
					</span>
					{resourceUrl ? (
						<a
							href={resourceUrl}
							className="text-xs text-primary hover:underline inline-flex items-center gap-1"
							target="_blank"
							rel="noopener noreferrer"
						>
							{localization?.COMMENTS_MY_VIEW_LINK ??
								t("comments.my.viewLink", "View")}
							<ExternalLink className="h-3 w-3" />
						</a>
					) : (
						<span className="text-xs text-muted-foreground truncate max-w-[100px]">
							{comment.resourceId}
						</span>
					)}
				</div>
			</TableCell>

			<TableCell>
				<StatusBadge status={comment.status} localization={localization} />
			</TableCell>

			<TableCell className="hidden md:table-cell text-xs text-muted-foreground">
				{formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
			</TableCell>

			<TableCell>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-muted-foreground hover:text-destructive"
					onClick={onDelete}
					disabled={isDeleting}
					data-testid="my-comment-delete-button"
				>
					<Trash2 className="h-4 w-4" />
					<span className="sr-only">
						{localization?.COMMENTS_MY_DELETE_BUTTON_SR ??
							t("comments.my.deleteButtonSr", "Delete comment")}
					</span>
				</Button>
			</TableCell>
		</TableRow>
	);
}
