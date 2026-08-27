"use client";

import type { SerializedComment } from "../../../types";
import {
	useSuspenseComments,
	useUpdateCommentStatus,
	useDeleteComment,
} from "../../hooks/use-comments";
import { CommentThread } from "../comment-thread";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import { CheckCircle, ShieldOff, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
	PermissionAccess,
	useNotify,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import type { CommentsLocalization } from "../../localization";
import { getInitials } from "../../utils";
import { commentsPermissions } from "../../../permissions";

interface ResourceCommentsPageProps {
	resourceId: string;
	resourceType: string;
	localization?: Partial<CommentsLocalization>;
}

export function ResourceCommentsPage({
	resourceId,
	resourceType,
	localization,
}: ResourceCommentsPageProps) {
	const t = useTranslate();
	const notify = useNotify();
	const { api } = useStack();
	const config = {
		apiBaseURL: api?.baseURL ?? "",
		apiBasePath: api?.basePath ?? "",
	};

	const {
		comments: pendingComments,
		total: pendingTotal,
		refetch,
	} = useSuspenseComments(config, {
		resourceId,
		resourceType,
		status: "pending",
	});

	const updateStatus = useUpdateCommentStatus(config);
	const deleteMutation = useDeleteComment(config);

	const handleApprove = async (id: string) => {
		try {
			await updateStatus.mutateAsync({ id, status: "approved" });
			notify.success(
				localization?.COMMENTS_RESOURCE_TOAST_APPROVED ??
					t("comments.resource.toastApproved", "Comment approved"),
			);
			refetch();
		} catch {
			notify.error(
				localization?.COMMENTS_RESOURCE_TOAST_APPROVE_ERROR ??
					t("comments.resource.toastApproveError", "Failed to approve"),
			);
		}
	};

	const handleSpam = async (id: string) => {
		try {
			await updateStatus.mutateAsync({ id, status: "spam" });
			notify.success(
				localization?.COMMENTS_RESOURCE_TOAST_SPAM ??
					t("comments.resource.toastSpam", "Marked as spam"),
			);
			refetch();
		} catch {
			notify.error(
				localization?.COMMENTS_RESOURCE_TOAST_SPAM_ERROR ??
					t("comments.resource.toastSpamError", "Failed to update"),
			);
		}
	};

	const handleDelete = async (id: string) => {
		const confirmMessage =
			localization?.COMMENTS_RESOURCE_DELETE_CONFIRM ??
			t("comments.resource.deleteConfirm", "Delete this comment?");
		if (!window.confirm(confirmMessage)) return;
		try {
			await deleteMutation.mutateAsync(id);
			notify.success(
				localization?.COMMENTS_RESOURCE_TOAST_DELETED ??
					t("comments.resource.toastDeleted", "Comment deleted"),
			);
			refetch();
		} catch {
			notify.error(
				localization?.COMMENTS_RESOURCE_TOAST_DELETE_ERROR ??
					t("comments.resource.toastDeleteError", "Failed to delete"),
			);
		}
	};

	return (
		<div
			className="w-full max-w-3xl space-y-8"
			data-testid="resource-comments-page"
		>
			<div>
				<h1 className="text-2xl font-bold">
					{localization?.COMMENTS_RESOURCE_TITLE ??
						t("comments.resource.title", "Comments")}
				</h1>
				<p className="text-muted-foreground text-sm mt-1">
					{resourceType}/{resourceId}
				</p>
			</div>

			{pendingTotal > 0 && (
				<div className="space-y-3">
					<h2 className="text-base font-semibold flex items-center gap-2">
						{localization?.COMMENTS_RESOURCE_PENDING_SECTION ??
							t("comments.resource.pendingSection", "Pending Review")}
						<Badge variant="secondary">{pendingTotal}</Badge>
					</h2>
					<div className="divide-y divide-border rounded-lg border">
						{pendingComments.map((comment) => (
							<PendingCommentRow
								key={comment.id}
								comment={comment}
								localization={localization}
								onApprove={() => handleApprove(comment.id)}
								onSpam={() => handleSpam(comment.id)}
								onDelete={() => handleDelete(comment.id)}
								isUpdating={updateStatus.isPending}
								isDeleting={deleteMutation.isPending}
							/>
						))}
					</div>
				</div>
			)}

			<div>
				<h2 className="text-base font-semibold mb-4">
					{localization?.COMMENTS_RESOURCE_THREAD_SECTION ??
						t("comments.resource.threadSection", "Thread")}
				</h2>
				<CommentThread
					resourceId={resourceId}
					resourceType={resourceType}
					localization={localization}
				/>
			</div>
		</div>
	);
}

function PendingCommentRow({
	comment,
	localization,
	onApprove,
	onSpam,
	onDelete,
	isUpdating,
	isDeleting,
}: {
	comment: SerializedComment;
	localization?: Partial<CommentsLocalization>;
	onApprove: () => void;
	onSpam: () => void;
	onDelete: () => void;
	isUpdating: boolean;
	isDeleting: boolean;
}) {
	const t = useTranslate();
	return (
		<div className="flex gap-3 p-4" data-testid="pending-comment-row">
			<Avatar className="h-8 w-8 shrink-0 mt-0.5">
				{comment.resolvedAvatarUrl && (
					<AvatarImage src={comment.resolvedAvatarUrl} />
				)}
				<AvatarFallback className="text-xs">
					{getInitials(comment.resolvedAuthorName)}
				</AvatarFallback>
			</Avatar>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 mb-1">
					<span className="text-sm font-medium">
						{comment.resolvedAuthorName}
					</span>
					<span className="text-xs text-muted-foreground">
						{formatDistanceToNow(new Date(comment.createdAt), {
							addSuffix: true,
						})}
					</span>
				</div>
				<p className="text-sm whitespace-pre-wrap break-words">
					{comment.body}
				</p>
				<div className="flex gap-1 mt-2">
					<PermissionAccess
						permission={commentsPermissions.comment.moderate({
							commentId: comment.id,
							resourceId: comment.resourceId,
							resourceType: comment.resourceType,
							currentStatus: comment.status,
							nextStatus: "approved",
						})}
					>
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
							onClick={onApprove}
							disabled={isUpdating}
							data-testid="approve-button"
						>
							<CheckCircle className="h-3.5 w-3.5 mr-1" />
							{localization?.COMMENTS_RESOURCE_ACTION_APPROVE ??
								t("comments.resource.actionApprove", "Approve")}
						</Button>
					</PermissionAccess>
					<PermissionAccess
						permission={commentsPermissions.comment.moderate({
							commentId: comment.id,
							resourceId: comment.resourceId,
							resourceType: comment.resourceType,
							currentStatus: comment.status,
							nextStatus: "spam",
						})}
					>
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-xs text-orange-500 border-orange-200 hover:bg-orange-50"
							onClick={onSpam}
							disabled={isUpdating}
						>
							<ShieldOff className="h-3.5 w-3.5 mr-1" />
							{localization?.COMMENTS_RESOURCE_ACTION_SPAM ??
								t("comments.resource.actionSpam", "Spam")}
						</Button>
					</PermissionAccess>
					<PermissionAccess
						permission={commentsPermissions.comment.delete({
							commentId: comment.id,
							authorId: comment.authorId,
						})}
					>
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
							onClick={onDelete}
							disabled={isDeleting}
						>
							<Trash2 className="h-3.5 w-3.5 mr-1" />
							{localization?.COMMENTS_RESOURCE_ACTION_DELETE ??
								t("comments.resource.actionDelete", "Delete")}
						</Button>
					</PermissionAccess>
				</div>
			</div>
		</div>
	);
}
