"use client";

import { useEffect, useState, type ReactNode } from "react";
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
import { formatDistanceToNow } from "date-fns";
import {
	PermissionAccess,
	useNotify,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import type { PermissionRequest } from "@btst/stack/authorization";
import { useListState } from "@btst/stack/client/hooks";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import type { SerializedComment, CommentStatus } from "../../../types";
import {
	useSuspenseModerationComments,
	useUpdateCommentStatus,
	useDeleteComment,
} from "../../hooks/use-comments";
import type { CommentsLocalization } from "../../localization";
import { getInitials } from "../../utils";
import { Pagination } from "../shared/pagination";
import { commentsPermissions } from "../../../permissions";
import {
	MODERATION_LIST_STATE_SCHEMA,
	resolveModerationStatus,
} from "./moderation-state";

interface ModerationPageProps {
	localization?: Partial<CommentsLocalization>;
}

function PermissionAccessAll({
	permissions,
	children,
}: {
	permissions: readonly PermissionRequest[];
	children: ReactNode;
}) {
	const [permission, ...rest] = permissions;
	if (!permission) return <>{children}</>;
	return (
		<PermissionAccess permission={permission}>
			<PermissionAccessAll permissions={rest}>{children}</PermissionAccessAll>
		</PermissionAccess>
	);
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

export function ModerationPage({ localization }: ModerationPageProps) {
	const t = useTranslate();
	const notify = useNotify();
	const { api } = useStack();

	const [listState, setListState] = useListState(
		"comments-moderation",
		MODERATION_LIST_STATE_SCHEMA,
	);
	// Bound the URL-sourced values: unknown tabs fall back to "pending",
	// pages clamp to >= 1 so a mangled URL cannot produce an invalid query.
	const activeTab = resolveModerationStatus(listState.tab);
	const currentPage = Math.max(1, Math.floor(listState.page) || 1);

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [viewComment, setViewComment] = useState<SerializedComment | null>(
		null,
	);
	const [deleteIds, setDeleteIds] = useState<string[]>([]);

	const config = {
		apiBaseURL: api?.baseURL ?? "",
		apiBasePath: api?.basePath ?? "",
	};

	const { comments, total, limit, offset, totalPages, refetch } =
		useSuspenseModerationComments(config, {
			status: activeTab,
			page: currentPage,
		});
	const selectedComments = comments.filter((comment) =>
		selected.has(comment.id),
	);
	const hasResolvedSelection =
		selected.size > 0 && selectedComments.length === selected.size;
	const deleteComments = comments.filter((comment) =>
		deleteIds.includes(comment.id),
	);
	const hasResolvedDeleteScope =
		deleteIds.length > 0 && deleteComments.length === deleteIds.length;

	useEffect(() => {
		setSelected(new Set());
		setDeleteIds([]);
	}, [activeTab, currentPage]);

	const updateStatus = useUpdateCommentStatus(config);
	const deleteMutation = useDeleteComment(config);

	// Register AI context with pending comment previews
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
			notify.success(
				localization?.COMMENTS_MODERATION_TOAST_APPROVED ??
					t("comments.moderation.toastApproved", "Comment approved"),
			);
			await refetch();
		} catch {
			notify.error(
				localization?.COMMENTS_MODERATION_TOAST_APPROVE_ERROR ??
					t(
						"comments.moderation.toastApproveError",
						"Failed to approve comment",
					),
			);
		}
	};

	const handleSpam = async (id: string) => {
		try {
			await updateStatus.mutateAsync({ id, status: "spam" });
			notify.success(
				localization?.COMMENTS_MODERATION_TOAST_SPAM ??
					t("comments.moderation.toastSpam", "Marked as spam"),
			);
			await refetch();
		} catch {
			notify.error(
				localization?.COMMENTS_MODERATION_TOAST_SPAM_ERROR ??
					t("comments.moderation.toastSpamError", "Failed to update status"),
			);
		}
	};

	const handleDelete = async (ids: string[]) => {
		try {
			await Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)));
			notify.success(
				ids.length === 1
					? (localization?.COMMENTS_MODERATION_TOAST_DELETED ??
							t("comments.moderation.toastDeleted", "Comment deleted"))
					: (
							localization?.COMMENTS_MODERATION_TOAST_DELETED_PLURAL ??
							t(
								"comments.moderation.toastDeletedPlural",
								"{n} comments deleted",
							)
						).replace("{n}", String(ids.length)),
			);
			setSelected(new Set());
			setDeleteIds([]);
			await refetch();
		} catch {
			notify.error(
				localization?.COMMENTS_MODERATION_TOAST_DELETE_ERROR ??
					t(
						"comments.moderation.toastDeleteError",
						"Failed to delete comment(s)",
					),
			);
		}
	};

	const handleBulkApprove = async () => {
		const ids = selectedComments.map((comment) => comment.id);
		try {
			await Promise.all(
				ids.map((id) => updateStatus.mutateAsync({ id, status: "approved" })),
			);
			notify.success(
				(
					localization?.COMMENTS_MODERATION_TOAST_BULK_APPROVED ??
					t("comments.moderation.toastBulkApproved", "{n} comment(s) approved")
				).replace("{n}", String(ids.length)),
			);
			setSelected(new Set());
			await refetch();
		} catch {
			notify.error(
				localization?.COMMENTS_MODERATION_TOAST_BULK_APPROVE_ERROR ??
					t(
						"comments.moderation.toastBulkApproveError",
						"Failed to approve comments",
					),
			);
		}
	};

	return (
		<div className="w-full max-w-5xl space-y-6" data-testid="moderation-page">
			<div>
				<h1 className="text-2xl font-bold">
					{localization?.COMMENTS_MODERATION_TITLE ??
						t("comments.moderation.title", "Comment Moderation")}
				</h1>
				<p className="text-muted-foreground text-sm mt-1">
					{localization?.COMMENTS_MODERATION_DESCRIPTION ??
						t(
							"comments.moderation.description",
							"Review and manage comments across all resources.",
						)}
				</p>
			</div>

			<Tabs
				value={activeTab}
				onValueChange={(v) => {
					setListState({ tab: v as CommentStatus, page: 1 });
					setSelected(new Set());
				}}
			>
				<TabsList>
					<TabsTrigger value="pending" data-testid="tab-pending">
						{localization?.COMMENTS_MODERATION_TAB_PENDING ??
							t("comments.moderation.tabPending", "Pending")}
					</TabsTrigger>
					<TabsTrigger value="approved" data-testid="tab-approved">
						{localization?.COMMENTS_MODERATION_TAB_APPROVED ??
							t("comments.moderation.tabApproved", "Approved")}
					</TabsTrigger>
					<TabsTrigger value="spam" data-testid="tab-spam">
						{localization?.COMMENTS_MODERATION_TAB_SPAM ??
							t("comments.moderation.tabSpam", "Spam")}
					</TabsTrigger>
				</TabsList>
			</Tabs>

			{/* Bulk actions toolbar */}
			{hasResolvedSelection && (
				<div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
					<span className="text-sm text-muted-foreground">
						{(
							localization?.COMMENTS_MODERATION_SELECTED ??
							t("comments.moderation.selected", "{n} selected")
						).replace("{n}", String(selected.size))}
					</span>
					{activeTab !== "approved" && (
						<PermissionAccessAll
							permissions={selectedComments.map((comment) =>
								commentsPermissions.comment.moderate({
									commentId: comment.id,
									resourceId: comment.resourceId,
									resourceType: comment.resourceType,
									currentStatus: comment.status,
									nextStatus: "approved",
								}),
							)}
						>
							<Button
								size="sm"
								variant="outline"
								onClick={handleBulkApprove}
								disabled={updateStatus.isPending}
							>
								<CheckCircle className="h-4 w-4 mr-1" />
								{localization?.COMMENTS_MODERATION_APPROVE_SELECTED ??
									t("comments.moderation.approveSelected", "Approve selected")}
							</Button>
						</PermissionAccessAll>
					)}
					<PermissionAccessAll
						permissions={selectedComments.map((comment) =>
							commentsPermissions.comment.delete({
								commentId: comment.id,
								authorId: comment.authorId,
							}),
						)}
					>
						<Button
							size="sm"
							variant="outline"
							className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
							onClick={() =>
								setDeleteIds(selectedComments.map((comment) => comment.id))
							}
						>
							<Trash2 className="h-4 w-4 mr-1" />
							{localization?.COMMENTS_MODERATION_DELETE_SELECTED ??
								t("comments.moderation.deleteSelected", "Delete selected")}
						</Button>
					</PermissionAccessAll>
				</div>
			)}

			{comments.length === 0 ? (
				<div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
					<CheckCircle className="h-8 w-8" />
					<p className="text-sm">
						{(
							localization?.COMMENTS_MODERATION_EMPTY ??
							t("comments.moderation.empty", "No {status} comments.")
						).replace("{status}", activeTab)}
					</p>
				</div>
			) : (
				<>
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
											aria-label={
												localization?.COMMENTS_MODERATION_SELECT_ALL ??
												t("comments.moderation.selectAll", "Select all")
											}
										/>
									</TableHead>
									<TableHead>
										{localization?.COMMENTS_MODERATION_COL_AUTHOR ??
											t("comments.moderation.colAuthor", "Author")}
									</TableHead>
									<TableHead>
										{localization?.COMMENTS_MODERATION_COL_COMMENT ??
											t("comments.moderation.colComment", "Comment")}
									</TableHead>
									<TableHead>
										{localization?.COMMENTS_MODERATION_COL_RESOURCE ??
											t("comments.moderation.colResource", "Resource")}
									</TableHead>
									<TableHead>
										{localization?.COMMENTS_MODERATION_COL_DATE ??
											t("comments.moderation.colDate", "Date")}
									</TableHead>
									<TableHead className="w-36">
										{localization?.COMMENTS_MODERATION_COL_ACTIONS ??
											t("comments.moderation.colActions", "Actions")}
									</TableHead>
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
												aria-label={
													localization?.COMMENTS_MODERATION_SELECT_ONE ??
													t("comments.moderation.selectOne", "Select comment")
												}
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
													title={
														localization?.COMMENTS_MODERATION_ACTION_VIEW ??
														t("comments.moderation.actionView", "View")
													}
													onClick={() => setViewComment(comment)}
													data-testid="view-button"
												>
													<Eye className="h-4 w-4" />
												</Button>
												{activeTab !== "approved" && (
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
															variant="ghost"
															size="icon"
															className="h-7 w-7 text-green-600 hover:text-green-700"
															title={
																localization?.COMMENTS_MODERATION_ACTION_APPROVE ??
																t(
																	"comments.moderation.actionApprove",
																	"Approve",
																)
															}
															onClick={() => handleApprove(comment.id)}
															disabled={updateStatus.isPending}
															data-testid="approve-button"
														>
															<CheckCircle className="h-4 w-4" />
														</Button>
													</PermissionAccess>
												)}
												{activeTab !== "spam" && (
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
															variant="ghost"
															size="icon"
															className="h-7 w-7 text-orange-500 hover:text-orange-600"
															title={
																localization?.COMMENTS_MODERATION_ACTION_SPAM ??
																t(
																	"comments.moderation.actionSpam",
																	"Mark as spam",
																)
															}
															onClick={() => handleSpam(comment.id)}
															disabled={updateStatus.isPending}
															data-testid="spam-button"
														>
															<ShieldOff className="h-4 w-4" />
														</Button>
													</PermissionAccess>
												)}
												<PermissionAccess
													permission={commentsPermissions.comment.delete({
														commentId: comment.id,
														authorId: comment.authorId,
													})}
												>
													<Button
														variant="ghost"
														size="icon"
														className="h-7 w-7 text-destructive hover:text-destructive"
														title={
															localization?.COMMENTS_MODERATION_ACTION_DELETE ??
															t("comments.moderation.actionDelete", "Delete")
														}
														onClick={() => setDeleteIds([comment.id])}
														data-testid="delete-button"
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</PermissionAccess>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<Pagination
						currentPage={currentPage}
						totalPages={totalPages}
						onPageChange={(p) => {
							setListState({ page: p });
							setSelected(new Set());
						}}
						total={total}
						limit={limit}
						offset={offset}
					/>
				</>
			)}

			{/* View comment dialog */}
			<Dialog open={!!viewComment} onOpenChange={() => setViewComment(null)}>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>
							{localization?.COMMENTS_MODERATION_DIALOG_TITLE ??
								t("comments.moderation.dialogTitle", "Comment Details")}
						</DialogTitle>
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
									<p className="text-muted-foreground text-xs">
										{localization?.COMMENTS_MODERATION_DIALOG_RESOURCE ??
											t("comments.moderation.dialogResource", "Resource")}
									</p>
									<p className="font-mono text-xs">
										{viewComment.resourceType}/{viewComment.resourceId}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground text-xs">
										{localization?.COMMENTS_MODERATION_DIALOG_LIKES ??
											t("comments.moderation.dialogLikes", "Likes")}
									</p>
									<p>{viewComment.likes}</p>
								</div>
								{viewComment.parentId && (
									<div>
										<p className="text-muted-foreground text-xs">
											{localization?.COMMENTS_MODERATION_DIALOG_REPLY_TO ??
												t("comments.moderation.dialogReplyTo", "Reply to")}
										</p>
										<p className="font-mono text-xs">{viewComment.parentId}</p>
									</div>
								)}
								{viewComment.editedAt && (
									<div>
										<p className="text-muted-foreground text-xs">
											{localization?.COMMENTS_MODERATION_DIALOG_EDITED ??
												t("comments.moderation.dialogEdited", "Edited")}
										</p>
										<p className="text-xs">
											{new Date(viewComment.editedAt).toLocaleString()}
										</p>
									</div>
								)}
							</div>

							<div>
								<p className="text-muted-foreground text-xs mb-1">
									{localization?.COMMENTS_MODERATION_DIALOG_BODY ??
										t("comments.moderation.dialogBody", "Body")}
								</p>
								<div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap break-words">
									{viewComment.body}
								</div>
							</div>

							<div className="flex justify-end gap-2">
								{viewComment.status !== "approved" && (
									<PermissionAccess
										permission={commentsPermissions.comment.moderate({
											commentId: viewComment.id,
											resourceId: viewComment.resourceId,
											resourceType: viewComment.resourceType,
											currentStatus: viewComment.status,
											nextStatus: "approved",
										})}
									>
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
											{localization?.COMMENTS_MODERATION_DIALOG_APPROVE ??
												t("comments.moderation.dialogApprove", "Approve")}
										</Button>
									</PermissionAccess>
								)}
								{viewComment.status !== "spam" && (
									<PermissionAccess
										permission={commentsPermissions.comment.moderate({
											commentId: viewComment.id,
											resourceId: viewComment.resourceId,
											resourceType: viewComment.resourceType,
											currentStatus: viewComment.status,
											nextStatus: "spam",
										})}
									>
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
											{localization?.COMMENTS_MODERATION_DIALOG_MARK_SPAM ??
												t("comments.moderation.dialogMarkSpam", "Mark spam")}
										</Button>
									</PermissionAccess>
								)}
								<PermissionAccess
									permission={commentsPermissions.comment.delete({
										commentId: viewComment.id,
										authorId: viewComment.authorId,
									})}
								>
									<Button
										size="sm"
										variant="destructive"
										onClick={() => {
											setDeleteIds([viewComment.id]);
											setViewComment(null);
										}}
									>
										<Trash2 className="h-4 w-4 mr-1" />
										{localization?.COMMENTS_MODERATION_DIALOG_DELETE ??
											t("comments.moderation.dialogDelete", "Delete")}
									</Button>
								</PermissionAccess>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>

			{/* Delete confirmation dialog */}
			<AlertDialog
				open={hasResolvedDeleteScope}
				onOpenChange={(open) => !open && setDeleteIds([])}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{deleteIds.length === 1
								? (localization?.COMMENTS_MODERATION_DELETE_TITLE_SINGULAR ??
									t(
										"comments.moderation.deleteTitleSingular",
										"Delete comment?",
									))
								: (
										localization?.COMMENTS_MODERATION_DELETE_TITLE_PLURAL ??
										t(
											"comments.moderation.deleteTitlePlural",
											"Delete {n} comments?",
										)
									).replace("{n}", String(deleteIds.length))}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{deleteIds.length === 1
								? (localization?.COMMENTS_MODERATION_DELETE_DESCRIPTION_SINGULAR ??
									t(
										"comments.moderation.deleteDescriptionSingular",
										"This action cannot be undone. The comment will be permanently deleted.",
									))
								: (localization?.COMMENTS_MODERATION_DELETE_DESCRIPTION_PLURAL ??
									t(
										"comments.moderation.deleteDescriptionPlural",
										"This action cannot be undone. The comments will be permanently deleted.",
									))}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{localization?.COMMENTS_MODERATION_DELETE_CANCEL ??
								t("comments.moderation.deleteCancel", "Cancel")}
						</AlertDialogCancel>
						<PermissionAccessAll
							permissions={deleteComments.map((comment) =>
								commentsPermissions.comment.delete({
									commentId: comment.id,
									authorId: comment.authorId,
								}),
							)}
						>
							<AlertDialogAction
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
								onClick={() =>
									handleDelete(deleteComments.map((comment) => comment.id))
								}
								data-testid="confirm-delete-button"
							>
								{deleteMutation.isPending
									? (localization?.COMMENTS_MODERATION_DELETE_DELETING ??
										t("comments.moderation.deleteDeleting", "Deleting…"))
									: (localization?.COMMENTS_MODERATION_DELETE_CONFIRM ??
										t("comments.moderation.deleteConfirm", "Delete"))}
							</AlertDialogAction>
						</PermissionAccessAll>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
