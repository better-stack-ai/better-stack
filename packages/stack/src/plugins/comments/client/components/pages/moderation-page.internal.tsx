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
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
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
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Checkbox } from "@workspace/ui/components/checkbox";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import { CheckCircle, ShieldOff, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import type { SerializedComment, CommentStatus } from "../../../types";
import {
	useSuspenseComments,
	useUpdateCommentStatus,
	useDeleteComment,
} from "../../hooks/use-comments";

interface ModerationPageProps {
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
}

function getInitials(name: string) {
	return name
		.split(" ")
		.slice(0, 2)
		.map((n) => n[0])
		.join("")
		.toUpperCase();
}

function StatusBadge({ status }: { status: CommentStatus }) {
	const variants: Record<
		CommentStatus,
		"secondary" | "default" | "destructive"
	> = {
		pending: "secondary",
		approved: "default",
		spam: "destructive",
	};
	return <Badge variant={variants[status]}>{status}</Badge>;
}

export function ModerationPage({
	apiBaseURL,
	apiBasePath,
	headers,
}: ModerationPageProps) {
	const [activeTab, setActiveTab] = useState<CommentStatus>("pending");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [viewComment, setViewComment] = useState<SerializedComment | null>(
		null,
	);
	const [deleteIds, setDeleteIds] = useState<string[]>([]);

	const config = { apiBaseURL, apiBasePath, headers };

	const { comments, total, refetch } = useSuspenseComments(config, {
		status: activeTab,
	});

	const updateStatus = useUpdateCommentStatus(config);
	const deleteMutation = useDeleteComment(config);

	// Register AI context with pending comment previews
	const pendingComments = activeTab === "pending" ? comments : [];
	useRegisterPageAIContext({
		routeName: "comments-moderation",
		pageDescription: `${total} ${activeTab} comments in the moderation queue.\n\nTop ${activeTab} comments:\n${comments
			.slice(0, 5)
			.map(
				(c) =>
					`- "${c.body.slice(0, 80)}${c.body.length > 80 ? "…" : ""}" by ${c.resolvedAuthorName} on ${c.resourceType}/${c.resourceId}`,
			)
			.join("\n")}`,
		suggestions: [
			"Approve all safe-looking comments",
			"Flag spam comments",
			"Summarize today's discussion",
		],
	});

	const toggleSelect = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});
	};

	const toggleSelectAll = () => {
		if (selected.size === comments.length) {
			setSelected(new Set());
		} else {
			setSelected(new Set(comments.map((c) => c.id)));
		}
	};

	const handleApprove = async (id: string) => {
		try {
			await updateStatus.mutateAsync({ id, status: "approved" });
			toast.success("Comment approved");
			await refetch();
		} catch {
			toast.error("Failed to approve comment");
		}
	};

	const handleSpam = async (id: string) => {
		try {
			await updateStatus.mutateAsync({ id, status: "spam" });
			toast.success("Marked as spam");
			await refetch();
		} catch {
			toast.error("Failed to update status");
		}
	};

	const handleDelete = async (ids: string[]) => {
		try {
			await Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)));
			toast.success(
				ids.length === 1 ? "Comment deleted" : `${ids.length} comments deleted`,
			);
			setSelected(new Set());
			setDeleteIds([]);
			await refetch();
		} catch {
			toast.error("Failed to delete comment(s)");
		}
	};

	const handleBulkApprove = async () => {
		const ids = [...selected];
		try {
			await Promise.all(
				ids.map((id) => updateStatus.mutateAsync({ id, status: "approved" })),
			);
			toast.success(`${ids.length} comment(s) approved`);
			setSelected(new Set());
			await refetch();
		} catch {
			toast.error("Failed to approve comments");
		}
	};

	return (
		<div className="w-full max-w-5xl space-y-6" data-testid="moderation-page">
			<div>
				<h1 className="text-2xl font-bold">Comment Moderation</h1>
				<p className="text-muted-foreground text-sm mt-1">
					Review and manage comments across all resources.
				</p>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={(v) => {
					setActiveTab(v as CommentStatus);
					setSelected(new Set());
				}}
			>
				<TabsList>
					<TabsTrigger value="pending" data-testid="tab-pending">
						Pending
					</TabsTrigger>
					<TabsTrigger value="approved" data-testid="tab-approved">
						Approved
					</TabsTrigger>
					<TabsTrigger value="spam" data-testid="tab-spam">
						Spam
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{/* Bulk actions toolbar */}
			{selected.size > 0 && (
				<div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
					<span className="text-sm text-muted-foreground">
						{selected.size} selected
					</span>
					{activeTab !== "approved" && (
						<Button
							size="sm"
							variant="outline"
							onClick={handleBulkApprove}
							disabled={updateStatus.isPending}
						>
							<CheckCircle className="h-4 w-4 mr-1" />
							Approve selected
						</Button>
					)}
					<Button
						size="sm"
						variant="outline"
						className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
						onClick={() => setDeleteIds([...selected])}
					>
						<Trash2 className="h-4 w-4 mr-1" />
						Delete selected
					</Button>
				</div>
			)}

			{comments.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
					<CheckCircle className="h-8 w-8" />
					<p className="text-sm">No {activeTab} comments.</p>
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10">
									<Checkbox
										checked={
											selected.size === comments.length && comments.length > 0
										}
										onCheckedChange={toggleSelectAll}
										aria-label="Select all"
									/>
								</TableHead>
								<TableHead>Author</TableHead>
								<TableHead>Comment</TableHead>
								<TableHead>Resource</TableHead>
								<TableHead>Date</TableHead>
								<TableHead className="w-36">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{comments.map((comment) => (
								<TableRow
									key={comment.id}
									data-testid="moderation-row"
									data-comment-id={comment.id}
								>
									<TableCell>
										<Checkbox
											checked={selected.has(comment.id)}
											onCheckedChange={() => toggleSelect(comment.id)}
											aria-label="Select comment"
										/>
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Avatar className="h-7 w-7">
												{comment.resolvedAvatarUrl && (
													<AvatarImage src={comment.resolvedAvatarUrl} />
												)}
												<AvatarFallback className="text-xs">
													{getInitials(comment.resolvedAuthorName)}
												</AvatarFallback>
											</Avatar>
											<span className="text-sm font-medium truncate max-w-[100px]">
												{comment.resolvedAuthorName}
											</span>
										</div>
									</TableCell>
									<TableCell>
										<p className="text-sm text-muted-foreground max-w-xs truncate">
											{comment.body}
										</p>
									</TableCell>
									<TableCell>
										<span className="text-xs text-muted-foreground">
											{comment.resourceType}/{comment.resourceId}
										</span>
									</TableCell>
									<TableCell className="text-xs text-muted-foreground whitespace-nowrap">
										{formatDistanceToNow(new Date(comment.createdAt), {
											addSuffix: true,
										})}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-1">
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7"
												title="View"
												onClick={() => setViewComment(comment)}
												data-testid="view-button"
											>
												<Eye className="h-4 w-4" />
											</Button>
											{activeTab !== "approved" && (
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7 text-green-600 hover:text-green-700"
													title="Approve"
													onClick={() => handleApprove(comment.id)}
													disabled={updateStatus.isPending}
													data-testid="approve-button"
												>
													<CheckCircle className="h-4 w-4" />
												</Button>
											)}
											{activeTab !== "spam" && (
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7 text-orange-500 hover:text-orange-600"
													title="Mark as spam"
													onClick={() => handleSpam(comment.id)}
													disabled={updateStatus.isPending}
													data-testid="spam-button"
												>
													<ShieldOff className="h-4 w-4" />
												</Button>
											)}
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7 text-destructive hover:text-destructive"
												title="Delete"
												onClick={() => setDeleteIds([comment.id])}
												data-testid="delete-button"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* View comment dialog */}
			<Dialog open={!!viewComment} onOpenChange={() => setViewComment(null)}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Comment Details</DialogTitle>
					</DialogHeader>
					{viewComment && (
						<div className="space-y-4">
							<div className="flex items-center gap-3">
								<Avatar className="h-10 w-10">
									{viewComment.resolvedAvatarUrl && (
										<AvatarImage src={viewComment.resolvedAvatarUrl} />
									)}
									<AvatarFallback>
										{getInitials(viewComment.resolvedAuthorName)}
									</AvatarFallback>
								</Avatar>
								<div>
									<p className="font-medium text-sm">
										{viewComment.resolvedAuthorName}
									</p>
									<p className="text-xs text-muted-foreground">
										{new Date(viewComment.createdAt).toLocaleString()}
									</p>
								</div>
								<StatusBadge status={viewComment.status} />
							</div>

							<div className="grid grid-cols-2 gap-3 text-sm">
								<div>
									<p className="text-muted-foreground text-xs">Resource</p>
									<p className="font-mono text-xs">
										{viewComment.resourceType}/{viewComment.resourceId}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs">Likes</p>
									<p>{viewComment.likes}</p>
								</div>
								{viewComment.parentId && (
									<div>
										<p className="text-muted-foreground text-xs">Reply to</p>
										<p className="font-mono text-xs">{viewComment.parentId}</p>
									</div>
								)}
								{viewComment.editedAt && (
									<div>
										<p className="text-muted-foreground text-xs">Edited</p>
										<p className="text-xs">
											{new Date(viewComment.editedAt).toLocaleString()}
										</p>
									</div>
								)}
							</div>

							<div>
								<p className="text-muted-foreground text-xs mb-1">Body</p>
								<div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap break-words">
									{viewComment.body}
								</div>
							</div>

							<div className="flex justify-end gap-2">
								{viewComment.status !== "approved" && (
									<Button
										size="sm"
										onClick={async () => {
											await handleApprove(viewComment.id);
											setViewComment(null);
										}}
										disabled={updateStatus.isPending}
										data-testid="dialog-approve-button"
									>
										<CheckCircle className="h-4 w-4 mr-1" />
										Approve
									</Button>
								)}
								{viewComment.status !== "spam" && (
									<Button
										size="sm"
										variant="outline"
										onClick={async () => {
											await handleSpam(viewComment.id);
											setViewComment(null);
										}}
										disabled={updateStatus.isPending}
									>
										<ShieldOff className="h-4 w-4 mr-1" />
										Mark spam
									</Button>
								)}
								<Button
									size="sm"
									variant="destructive"
									onClick={() => {
										setDeleteIds([viewComment.id]);
										setViewComment(null);
									}}
								>
									<Trash2 className="h-4 w-4 mr-1" />
									Delete
								</Button>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>

			{/* Delete confirmation dialog */}
			<AlertDialog
				open={deleteIds.length > 0}
				onOpenChange={(open) => !open && setDeleteIds([])}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							Delete{" "}
							{deleteIds.length === 1
								? "comment"
								: `${deleteIds.length} comments`}
							?
						</AlertDialogTitle>
						<AlertDialogDescription>
							This action cannot be undone. The{" "}
							{deleteIds.length === 1 ? "comment" : "comments"} will be
							permanently deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={() => handleDelete(deleteIds)}
							data-testid="confirm-delete-button"
						>
							{deleteMutation.isPending ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
