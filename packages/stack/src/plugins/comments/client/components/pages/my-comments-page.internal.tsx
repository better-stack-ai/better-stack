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
import {
	COMMENTS_LOCALIZATION,
	type CommentsLocalization,
} from "../../localization";

const PAGE_LIMIT = 20;

interface MyCommentsPageProps {
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
	currentUserId?: CommentsPluginOverrides["currentUserId"];
	resourceLinks?: CommentsPluginOverrides["resourceLinks"];
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

function StatusBadge({
	status,
	loc,
}: {
	status: CommentStatus;
	loc: CommentsLocalization;
}) {
	if (status === "approved") {
		return (
			<Badge variant="outline" className="text-green-700 border-green-300">
				{loc.COMMENTS_MY_STATUS_APPROVED}
			</Badge>
		);
	}
	if (status === "pending") {
		return (
			<Badge variant="outline" className="text-yellow-700 border-yellow-300">
				{loc.COMMENTS_MY_STATUS_PENDING}
			</Badge>
		);
	}
	return (
		<Badge variant="outline" className="text-red-700 border-red-300">
			{loc.COMMENTS_MY_STATUS_SPAM}
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
	localization: localizationProp,
}: MyCommentsPageProps) {
	const loc = { ...COMMENTS_LOCALIZATION, ...localizationProp };
	const resolvedUserId = useResolvedCurrentUserId(currentUserIdProp);

	if (!resolvedUserId) {
		return (
			<div
				className="flex flex-col items-center justify-center gap-4 py-20 text-center"
				data-testid="my-comments-login-prompt"
			>
				<LogIn className="h-10 w-10 text-muted-foreground" />
				<p className="text-lg font-medium">{loc.COMMENTS_MY_LOGIN_TITLE}</p>
				<p className="text-sm text-muted-foreground">
					{loc.COMMENTS_MY_LOGIN_DESCRIPTION}
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
			loc={loc}
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
	loc,
}: {
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
	currentUserId: string;
	resourceLinks?: CommentsPluginOverrides["resourceLinks"];
	loc: CommentsLocalization;
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
			toast.success(loc.COMMENTS_MY_TOAST_DELETED);
			refetch();
		} catch {
			toast.error(loc.COMMENTS_MY_TOAST_DELETE_ERROR);
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
				<p className="text-lg font-medium">{loc.COMMENTS_MY_EMPTY_TITLE}</p>
				<p className="text-sm text-muted-foreground">
					{loc.COMMENTS_MY_EMPTY_DESCRIPTION}
				</p>
			</div>
		);
	}

	return (
		<div data-testid="my-comments-page" className="space-y-4">
			<div>
				<h1 className="text-2xl font-bold tracking-tight">
					{loc.COMMENTS_MY_PAGE_TITLE}
				</h1>
				<p className="text-sm text-muted-foreground mt-1">
					{total} {loc.COMMENTS_MY_COL_COMMENT.toLowerCase()}
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
							<TableHead>{loc.COMMENTS_MY_COL_COMMENT}</TableHead>
							<TableHead className="hidden sm:table-cell w-32">
								{loc.COMMENTS_MY_COL_RESOURCE}
							</TableHead>
							<TableHead className="w-28">
								{loc.COMMENTS_MY_COL_STATUS}
							</TableHead>
							<TableHead className="hidden md:table-cell w-36">
								{loc.COMMENTS_MY_COL_DATE}
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
								loc={loc}
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
						<AlertDialogTitle>{loc.COMMENTS_MY_DELETE_TITLE}</AlertDialogTitle>
						<AlertDialogDescription>
							{loc.COMMENTS_MY_DELETE_DESCRIPTION}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{loc.COMMENTS_MY_DELETE_CANCEL}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{loc.COMMENTS_MY_DELETE_CONFIRM}
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
	loc,
	onDelete,
	isDeleting,
}: {
	comment: SerializedComment;
	resourceLinks?: CommentsPluginOverrides["resourceLinks"];
	loc: CommentsLocalization;
	onDelete: () => void;
	isDeleting: boolean;
}) {
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
						{loc.COMMENTS_MY_REPLY_INDICATOR}
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
							{loc.COMMENTS_MY_VIEW_LINK}
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
				<StatusBadge status={comment.status} loc={loc} />
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
					<span className="sr-only">{loc.COMMENTS_MY_DELETE_BUTTON_SR}</span>
				</Button>
			</TableCell>
		</TableRow>
	);
}
