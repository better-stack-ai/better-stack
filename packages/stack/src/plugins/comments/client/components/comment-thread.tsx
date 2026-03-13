"use client";

import { useState, type ComponentType } from "react";
import { WhenVisible } from "@workspace/ui/components/when-visible";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import { Heart, MessageSquare, Pencil, Check, X, LogIn } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SerializedComment } from "../../types";
import { CommentForm } from "./comment-form";
import {
	useComments,
	usePostComment,
	useUpdateComment,
	useDeleteComment,
	useToggleLike,
} from "../hooks/use-comments";

/** Custom input component props */
export interface CommentInputProps {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	placeholder?: string;
}

/** Custom renderer component props */
export interface CommentRendererProps {
	body: string;
}

/** Override slot for custom input + renderer */
export interface CommentComponents {
	Input?: ComponentType<CommentInputProps>;
	Renderer?: ComponentType<CommentRendererProps>;
}

export interface CommentThreadProps {
	/** The resource this thread is attached to (e.g. post slug, task ID) */
	resourceId: string;
	/** Discriminates resources across plugins (e.g. "blog-post", "kanban-task") */
	resourceType: string;
	/** Base URL for API calls */
	apiBaseURL: string;
	/** Path where the API is mounted */
	apiBasePath: string;
	/** Currently authenticated user ID. Omit for read-only / unauthenticated. */
	currentUserId?: string;
	/**
	 * URL to redirect unauthenticated users to.
	 * When provided and currentUserId is absent, shows a "Please login to comment" prompt.
	 */
	loginHref?: string;
	/** Optional HTTP headers for API calls (e.g. forwarding cookies) */
	headers?: HeadersInit;
	/** Swap in custom Input / Renderer components */
	components?: CommentComponents;
	/** Optional className applied to the root wrapper */
	className?: string;
}

const DEFAULT_RENDERER: ComponentType<CommentRendererProps> = ({ body }) => (
	<p className="text-sm whitespace-pre-wrap break-words">{body}</p>
);

function getInitials(name: string) {
	return name
		.split(" ")
		.slice(0, 2)
		.map((n) => n[0])
		.join("")
		.toUpperCase();
}

// ─── Comment Card ─────────────────────────────────────────────────────────────

function CommentCard({
	comment,
	currentUserId,
	apiBaseURL,
	apiBasePath,
	resourceId,
	resourceType,
	headers,
	components,
	onReplyClick,
}: {
	comment: SerializedComment;
	currentUserId?: string;
	apiBaseURL: string;
	apiBasePath: string;
	resourceId: string;
	resourceType: string;
	headers?: HeadersInit;
	components?: CommentComponents;
	onReplyClick: (parentId: string) => void;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const Renderer = components?.Renderer ?? DEFAULT_RENDERER;

	const config = { apiBaseURL, apiBasePath, headers };

	const updateMutation = useUpdateComment(config);
	const deleteMutation = useDeleteComment(config);
	const toggleLikeMutation = useToggleLike(config, {
		resourceId,
		resourceType,
		currentUserId,
	});

	const isOwn = currentUserId && comment.authorId === currentUserId;
	const isPending = comment.status === "pending";

	const handleEdit = async (body: string) => {
		await updateMutation.mutateAsync({ id: comment.id, body });
		setIsEditing(false);
	};

	const handleDelete = async () => {
		if (!window.confirm("Delete this comment?")) return;
		await deleteMutation.mutateAsync(comment.id);
	};

	const handleLike = () => {
		if (!currentUserId) return;
		toggleLikeMutation.mutate({
			commentId: comment.id,
			authorId: currentUserId,
		});
	};

	return (
		<div
			className="flex gap-3 py-3"
			data-testid="comment-card"
			data-comment-id={comment.id}
		>
			<Avatar className="h-8 w-8 shrink-0 mt-0.5">
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

			<div className="flex-1 min-w-0">
				<div className="flex flex-wrap items-center gap-2 mb-1">
					<span className="text-sm font-medium">
						{comment.resolvedAuthorName}
					</span>
					<span className="text-xs text-muted-foreground">
						{formatDistanceToNow(new Date(comment.createdAt), {
							addSuffix: true,
						})}
					</span>
					{comment.editedAt && (
						<span className="text-xs text-muted-foreground italic">
							(edited)
						</span>
					)}
					{isPending && isOwn && (
						<Badge
							variant="secondary"
							className="text-xs"
							data-testid="pending-badge"
						>
							Pending approval
						</Badge>
					)}
				</div>

				{isEditing ? (
					<CommentForm
						authorId={currentUserId ?? ""}
						initialBody={comment.body}
						submitLabel="Save"
						InputComponent={components?.Input}
						onSubmit={handleEdit}
						onCancel={() => setIsEditing(false)}
					/>
				) : (
					<Renderer body={comment.body} />
				)}

				{!isEditing && (
					<div className="flex items-center gap-1 mt-2">
						{currentUserId && (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs gap-1"
								onClick={handleLike}
								aria-label={comment.isLikedByCurrentUser ? "Unlike" : "Like"}
								data-testid="like-button"
							>
								<Heart
									className={`h-3.5 w-3.5 ${comment.isLikedByCurrentUser ? "fill-current text-red-500" : ""}`}
								/>
								{comment.likes > 0 && (
									<span data-testid="like-count">{comment.likes}</span>
								)}
							</Button>
						)}

						{currentUserId && !comment.parentId && (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={() => onReplyClick(comment.id)}
								data-testid="reply-button"
							>
								<MessageSquare className="h-3.5 w-3.5 mr-1" />
								Reply
							</Button>
						)}

						{isOwn && (
							<>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={() => setIsEditing(true)}
									data-testid="edit-button"
								>
									<Pencil className="h-3.5 w-3.5 mr-1" />
									Edit
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs text-destructive hover:text-destructive"
									onClick={handleDelete}
									disabled={deleteMutation.isPending}
									data-testid="delete-button"
								>
									<X className="h-3.5 w-3.5 mr-1" />
									Delete
								</Button>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Thread Inner (handles data) ──────────────────────────────────────────────

function CommentThreadInner({
	resourceId,
	resourceType,
	apiBaseURL,
	apiBasePath,
	currentUserId,
	loginHref,
	headers,
	components,
}: CommentThreadProps) {
	const [replyingTo, setReplyingTo] = useState<string | null>(null);
	const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
		new Set(),
	);

	const config = { apiBaseURL, apiBasePath, headers };

	const { comments, isLoading } = useComments(config, {
		resourceId,
		resourceType,
		status: "approved",
		parentId: null,
		currentUserId,
	});

	const postMutation = usePostComment(config, {
		resourceId,
		resourceType,
		currentUserId,
	});

	const handlePost = async (body: string) => {
		if (!currentUserId) return;
		await postMutation.mutateAsync({
			body,
			parentId: null,
		});
	};

	const handleReply = async (body: string, parentId: string) => {
		if (!currentUserId) return;
		await postMutation.mutateAsync({
			body,
			parentId,
		});
		setReplyingTo(null);
		setExpandedReplies((prev) => new Set(prev).add(parentId));
	};

	// Build a list including own pending comments (optimistic inserts include them)
	// The server only returns approved comments so we need to show pending ones too
	const allTopLevel = comments;

	return (
		<div className="space-y-1" data-testid="comment-thread">
			<div className="flex items-center gap-2 mb-4">
				<MessageSquare className="h-5 w-5 text-muted-foreground" />
				<h3 className="font-semibold text-sm">
					{comments.length === 0
						? "Comments"
						: `${comments.length} Comment${comments.length === 1 ? "" : "s"}`}
				</h3>
			</div>

			{isLoading && (
				<div className="space-y-4">
					{[1, 2].map((i) => (
						<div key={i} className="flex gap-3 py-3 animate-pulse">
							<div className="h-8 w-8 rounded-full bg-muted shrink-0" />
							<div className="flex-1 space-y-2">
								<div className="h-3 w-24 rounded bg-muted" />
								<div className="h-3 w-full rounded bg-muted" />
								<div className="h-3 w-3/4 rounded bg-muted" />
							</div>
						</div>
					))}
				</div>
			)}

			{!isLoading && allTopLevel.length > 0 && (
				<div className="divide-y divide-border">
					{allTopLevel.map((comment) => (
						<div key={comment.id}>
							<CommentCard
								comment={comment}
								currentUserId={currentUserId}
								apiBaseURL={apiBaseURL}
								apiBasePath={apiBasePath}
								resourceId={resourceId}
								resourceType={resourceType}
								headers={headers}
								components={components}
								onReplyClick={(parentId) => {
									setReplyingTo(replyingTo === parentId ? null : parentId);
								}}
							/>

							{/* Replies */}
							<RepliesSection
								parentId={comment.id}
								resourceId={resourceId}
								resourceType={resourceType}
								apiBaseURL={apiBaseURL}
								apiBasePath={apiBasePath}
								currentUserId={currentUserId}
								headers={headers}
								components={components}
								expanded={expandedReplies.has(comment.id)}
								onToggle={() => {
									setExpandedReplies((prev) => {
										const next = new Set(prev);
										next.has(comment.id)
											? next.delete(comment.id)
											: next.add(comment.id);
										return next;
									});
								}}
							/>

							{replyingTo === comment.id && currentUserId && (
								<div className="pl-11 pb-3">
									<CommentForm
										authorId={currentUserId}
										parentId={comment.id}
										submitLabel="Post reply"
										InputComponent={components?.Input}
										onSubmit={(body) => handleReply(body, comment.id)}
										onCancel={() => setReplyingTo(null)}
									/>
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{!isLoading && allTopLevel.length === 0 && (
				<p className="text-sm text-muted-foreground py-4 text-center">
					Be the first to comment.
				</p>
			)}

			<Separator className="my-4" />

			{currentUserId ? (
				<div data-testid="comment-form-wrapper">
					<CommentForm
						authorId={currentUserId}
						submitLabel="Post comment"
						InputComponent={components?.Input}
						onSubmit={handlePost}
					/>
				</div>
			) : (
				<div
					className="flex flex-col items-center gap-3 py-6 text-center border rounded-lg bg-muted/30"
					data-testid="login-prompt"
				>
					<LogIn className="h-6 w-6 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						Please sign in to leave a comment.
					</p>
					{loginHref && (
						<a
							href={loginHref}
							className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4"
							data-testid="login-link"
						>
							Sign in
						</a>
					)}
				</div>
			)}
		</div>
	);
}

// ─── Replies Section ───────────────────────────────────────────────────────────

function RepliesSection({
	parentId,
	resourceId,
	resourceType,
	apiBaseURL,
	apiBasePath,
	currentUserId,
	headers,
	components,
	expanded,
	onToggle,
}: {
	parentId: string;
	resourceId: string;
	resourceType: string;
	apiBaseURL: string;
	apiBasePath: string;
	currentUserId?: string;
	headers?: HeadersInit;
	components?: CommentComponents;
	expanded: boolean;
	onToggle: () => void;
}) {
	const config = { apiBaseURL, apiBasePath, headers };
	const { comments: replies } = useComments(config, {
		resourceId,
		resourceType,
		parentId,
		status: "approved",
		currentUserId,
	});

	if (replies.length === 0) return null;

	return (
		<div className="pl-11">
			{!expanded && (
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs mb-1"
					onClick={onToggle}
					data-testid="show-replies-button"
				>
					<Check className="h-3 w-3 mr-1" />
					{replies.length} {replies.length === 1 ? "reply" : "replies"}
				</Button>
			)}
			{expanded && (
				<div className="border-l-2 border-border pl-3 space-y-0">
					{replies.map((reply) => (
						<CommentCard
							key={reply.id}
							comment={reply}
							currentUserId={currentUserId}
							apiBaseURL={apiBaseURL}
							apiBasePath={apiBasePath}
							resourceId={resourceId}
							resourceType={resourceType}
							headers={headers}
							components={components}
							onReplyClick={() => {}} // No nested replies in v1
						/>
					))}
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs"
						onClick={onToggle}
					>
						Hide replies
					</Button>
				</div>
			)}
		</div>
	);
}

// ─── Public export: lazy-mounts on scroll into view ───────────────────────────

/**
 * Embeddable threaded comment section.
 *
 * Lazy-mounts when the component scrolls into the viewport (via WhenVisible).
 * Requires `currentUserId` to allow posting; shows a "Please login" prompt otherwise.
 *
 * @example
 * ```tsx
 * <CommentThread
 *   resourceId={post.slug}
 *   resourceType="blog-post"
 *   apiBaseURL="https://example.com"
 *   apiBasePath="/api/data"
 *   currentUserId={session?.userId}
 *   loginHref="/login"
 * />
 * ```
 */
export function CommentThread(props: CommentThreadProps) {
	return (
		<WhenVisible
			fallback={
				<div className="h-32 flex items-center justify-center">
					<MessageSquare className="h-5 w-5 text-muted-foreground animate-pulse" />
				</div>
			}
			rootMargin="300px"
			className={props.className}
		>
			<CommentThreadInner {...props} />
		</WhenVisible>
	);
}
