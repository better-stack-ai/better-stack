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
import { toast } from "sonner";
import {
	COMMENTS_LOCALIZATION,
	type CommentsLocalization,
} from "../../localization";

interface ResourceCommentsPageProps {
	resourceId: string;
	resourceType: string;
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
	localization?: CommentsLocalization;
}

function getInitials(name: string | null | undefined) {
	if (!name) return "?";
	return name
		.split(" ")
		.slice(0, 2)
		.map((n) => n[0])
		.join("")
		.toUpperCase();
}

export function ResourceCommentsPage({
	resourceId,
	resourceType,
	apiBaseURL,
	apiBasePath,
	headers,
	localization: localizationProp,
}: ResourceCommentsPageProps) {
	const loc = { ...COMMENTS_LOCALIZATION, ...localizationProp };
	const config = { apiBaseURL, apiBasePath, headers };

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
			toast.success(loc.COMMENTS_RESOURCE_TOAST_APPROVED);
			refetch();
		} catch {
			toast.error(loc.COMMENTS_RESOURCE_TOAST_APPROVE_ERROR);
		}
	};

	const handleSpam = async (id: string) => {
		try {
			await updateStatus.mutateAsync({ id, status: "spam" });
			toast.success(loc.COMMENTS_RESOURCE_TOAST_SPAM);
			refetch();
		} catch {
			toast.error(loc.COMMENTS_RESOURCE_TOAST_SPAM_ERROR);
		}
	};

	const handleDelete = async (id: string) => {
		if (!window.confirm(loc.COMMENTS_RESOURCE_DELETE_CONFIRM)) return;
		try {
			await deleteMutation.mutateAsync(id);
			toast.success(loc.COMMENTS_RESOURCE_TOAST_DELETED);
			refetch();
		} catch {
			toast.error(loc.COMMENTS_RESOURCE_TOAST_DELETE_ERROR);
		}
	};

	return (
		<div
			className="w-full max-w-3xl space-y-8"
			data-testid="resource-comments-page"
		>
			<div>
				<h1 className="text-2xl font-bold">{loc.COMMENTS_RESOURCE_TITLE}</h1>
				<p className="text-muted-foreground text-sm mt-1">
					{resourceType}/{resourceId}
				</p>
			</div>

			{pendingTotal > 0 && (
				<div className="space-y-3">
					<h2 className="text-base font-semibold flex items-center gap-2">
						{loc.COMMENTS_RESOURCE_PENDING_SECTION}
						<Badge variant="secondary">{pendingTotal}</Badge>
					</h2>
					<div className="divide-y divide-border rounded-lg border">
						{pendingComments.map((comment) => (
							<PendingCommentRow
								key={comment.id}
								comment={comment}
								loc={loc}
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
					{loc.COMMENTS_RESOURCE_THREAD_SECTION}
				</h2>
				<CommentThread
					resourceId={resourceId}
					resourceType={resourceType}
					apiBaseURL={apiBaseURL}
					apiBasePath={apiBasePath}
					headers={headers}
					localization={loc}
				/>
			</div>
		</div>
	);
}

function PendingCommentRow({
	comment,
	loc,
	onApprove,
	onSpam,
	onDelete,
	isUpdating,
	isDeleting,
}: {
	comment: SerializedComment;
	loc: CommentsLocalization;
	onApprove: () => void;
	onSpam: () => void;
	onDelete: () => void;
	isUpdating: boolean;
	isDeleting: boolean;
}) {
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
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
						onClick={onApprove}
						disabled={isUpdating}
						data-testid="approve-button"
					>
						<CheckCircle className="h-3.5 w-3.5 mr-1" />
						{loc.COMMENTS_RESOURCE_ACTION_APPROVE}
					</Button>
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs text-orange-500 border-orange-200 hover:bg-orange-50"
						onClick={onSpam}
						disabled={isUpdating}
					>
						<ShieldOff className="h-3.5 w-3.5 mr-1" />
						{loc.COMMENTS_RESOURCE_ACTION_SPAM}
					</Button>
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/5"
						onClick={onDelete}
						disabled={isDeleting}
					>
						<Trash2 className="h-3.5 w-3.5 mr-1" />
						{loc.COMMENTS_RESOURCE_ACTION_DELETE}
					</Button>
				</div>
			</div>
		</div>
	);
}
