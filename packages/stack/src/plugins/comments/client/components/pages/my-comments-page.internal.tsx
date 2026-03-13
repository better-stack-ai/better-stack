"use client";

import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { CommentsPluginOverrides } from "../../overrides";
import { PaginationControls } from "@workspace/ui/components/pagination-controls";
import type { SerializedComment, CommentStatus } from "../../../types";
import {
	useSuspenseComments,
	useDeleteComment,
} from "../../hooks/use-comments";

const PAGE_LIMIT = 20;

interface MyCommentsPageProps {
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
	currentUserId?: CommentsPluginOverrides["currentUserId"];
	resourceLinks?: CommentsPluginOverrides["resourceLinks"];
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

function StatusBadge({ status }: { status: CommentStatus }) {
	if (status === "approved") {
		return (
			<Badge variant="outline" className="text-green-700 border-green-300">
				Approved
			</Badge>
		);
	}
	if (status === "pending") {
		return (
			<Badge variant="outline" className="text-yellow-700 border-yellow-300">
				Pending
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-red-700 border-red-300">
			Spam
		</Badge>
	);
}

// ─── Resolved currentUserId hook ─────────────────────────────────────────────

function useResolvedCurrentUserId(
	raw: CommentsPluginOverrides["currentUserId"],
): string | undefined {
	const [resolved, setResolved] = useState<string | undefined>(
		typeof raw === "string" ? raw : undefined,
	);

	useEffect(() => {
		if (typeof raw === "function") {
			void Promise.resolve(raw()).then((id) => {
				setResolved(id ?? undefined);
			});
		} else {
			setResolved(raw ?? undefined);
		}
	}, [raw]);

	return resolved;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MyCommentsPage({
	apiBaseURL,
	apiBasePath,
	headers,
	currentUserId: currentUserIdProp,
	resourceLinks,
}: MyCommentsPageProps) {
	const resolvedUserId = useResolvedCurrentUserId(currentUserIdProp);

	if (!resolvedUserId) {
		return (
			<div
				className="flex flex-col items-center justify-center gap-4 py-20 text-center"
				data-testid="my-comments-login-prompt"
			>
				<LogIn className="h-10 w-10 text-muted-foreground" />
				<p className="text-lg font-medium">
					Please log in to view your comments
				</p>
				<p className="text-sm text-muted-foreground">
					You need to be logged in to see your comment history.
				</p>
			</div>
		);
	}

	return (
		<MyCommentsList
			apiBaseURL={apiBaseURL}
			apiBasePath={apiBasePath}
			headers={headers}
			currentUserId={resolvedUserId}
			resourceLinks={resourceLinks}
		/>
	);
}

// ─── List (suspense boundary is in ComposedRoute) ─────────────────────────────

function MyCommentsList({
	apiBaseURL,
	apiBasePath,
	headers,
	currentUserId,
	resourceLinks,
}: {
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
	currentUserId: string;
	resourceLinks?: CommentsPluginOverrides["resourceLinks"];
}) {
	const [page, setPage] = useState(1);
	const [deleteId, setDeleteId] = useState<string | null>(null);

	const config = { apiBaseURL, apiBasePath, headers };
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
			toast.success("Comment deleted");
			refetch();
		} catch {
			toast.error("Failed to delete comment");
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
				<p className="text-lg font-medium">No comments yet</p>
				<p className="text-sm text-muted-foreground">
					Comments you post will appear here.
				</p>
			</div>
		);
	}

	return (
		<div data-testid="my-comments-page" className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">My Comments</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{total} comment{total !== 1 ? "s" : ""}
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
							<TableHead>Comment</TableHead>
							<TableHead className="hidden sm:table-cell w-32">
								Resource
							</TableHead>
							<TableHead className="w-28">Status</TableHead>
							<TableHead className="hidden md:table-cell w-36">Date</TableHead>
							<TableHead className="w-16" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{comments.map((comment) => (
							<CommentRow
								key={comment.id}
								comment={comment}
								resourceLinks={resourceLinks}
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
						setPage(p);
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
						<AlertDialogTitle>Delete comment?</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. The comment will be permanently
							removed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Delete
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
	onDelete,
	isDeleting,
}: {
	comment: SerializedComment;
	resourceLinks?: CommentsPluginOverrides["resourceLinks"];
	onDelete: () => void;
	isDeleting: boolean;
}) {
	const resourceUrl = resourceLinks?.[comment.resourceType]?.(
		comment.resourceId,
	);

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
						↩ Reply
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
							View
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
				<StatusBadge status={comment.status} />
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
					<span className="sr-only">Delete comment</span>
				</Button>
			</TableCell>
		</TableRow>
	);
}
