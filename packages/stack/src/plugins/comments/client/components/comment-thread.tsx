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
import {
	COMMENTS_LOCALIZATION,
	type CommentsLocalization,
} from "../localization";

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
	/** Localization strings — defaults to English */
	localization?: Partial<CommentsLocalization>;
}

const DEFAULT_RENDERER: ComponentType<CommentRendererProps> = ({ body }) => (
	<p className="text-sm whitespace-pre-wrap break-words">{body}</p>
);

function getInitials(name: string | null | undefined) {
	if (!name) return "?";
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
	loc,
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
	loc: CommentsLocalization;
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
		parentId: comment.parentId,
		currentUserId,
	});

	const isOwn = currentUserId && comment.authorId === currentUserId;
	const isPending = comment.status === "pending";
	const isApproved = comment.status === "approved";

	const handleEdit = async (body: string) => {
		await updateMutation.mutateAsync({ id: comment.id, body });
		setIsEditing(false);
	};

	const handleDelete = async () => {
		if (!window.confirm(loc.COMMENTS_DELETE_CONFIRM)) return;
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
							{loc.COMMENTS_EDITED_BADGE}
						</span>
					)}
					{isPending && isOwn && (
						<Badge
							variant="secondary"
							className="text-xs"
							data-testid="pending-badge"
						>
							{loc.COMMENTS_PENDING_BADGE}
						</Badge>
					)}
				</div>

				{isEditing ? (
					<CommentForm
						authorId={currentUserId ?? ""}
						initialBody={comment.body}
						submitLabel={loc.COMMENTS_SAVE_EDIT}
						InputComponent={components?.Input}
						localization={loc}
						onSubmit={handleEdit}
						onCancel={() => setIsEditing(false)}
					/>
				) : (
					<Renderer body={comment.body} />
				)}

				{!isEditing && (
					<div className="flex items-center gap-1 mt-2">
						{currentUserId && isApproved && (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs gap-1"
								onClick={handleLike}
								aria-label={
									comment.isLikedByCurrentUser
										? loc.COMMENTS_UNLIKE_ARIA
										: loc.COMMENTS_LIKE_ARIA
								}
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

						{currentUserId && !comment.parentId && isApproved && (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={() => onReplyClick(comment.id)}
								data-testid="reply-button"
							>
								<MessageSquare className="h-3.5 w-3.5 mr-1" />
								{loc.COMMENTS_REPLY_BUTTON}
							</Button>
						)}

						{isOwn && (
							<>
								{isApproved && (
									<Button
										variant="ghost"
										size="sm"
										className="h-7 px-2 text-xs"
										onClick={() => setIsEditing(true)}
										data-testid="edit-button"
									>
										<Pencil className="h-3.5 w-3.5 mr-1" />
										{loc.COMMENTS_EDIT_BUTTON}
									</Button>
								)}
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs text-destructive hover:text-destructive"
									onClick={handleDelete}
									disabled={deleteMutation.isPending}
									data-testid="delete-button"
								>
									<X className="h-3.5 w-3.5 mr-1" />
									{loc.COMMENTS_DELETE_BUTTON}
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
	localization: localizationProp,
}: CommentThreadProps) {
	const loc = { ...COMMENTS_LOCALIZATION, ...localizationProp };
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

	const allTopLevel = comments;

	return (
		<div className="space-y-1" data-testid="comment-thread">
			<div className="flex items-center gap-2 mb-4">
				<MessageSquare className="h-5 w-5 text-muted-foreground" />
				<h3 className="font-semibold text-sm">
					{comments.length === 0
						? loc.COMMENTS_TITLE
						: `${comments.length} ${loc.COMMENTS_TITLE}`}
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
								loc={loc}
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
								loc={loc}
								expanded={expandedReplies.has(comment.id)}
								replyCount={comment.replyCount}
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
										submitLabel={loc.COMMENTS_FORM_POST_REPLY}
										InputComponent={components?.Input}
										localization={loc}
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
					{loc.COMMENTS_EMPTY}
				</p>
			)}

			<Separator className="my-4" />

			{currentUserId ? (
				<div data-testid="comment-form-wrapper">
					<CommentForm
						authorId={currentUserId}
						submitLabel={loc.COMMENTS_FORM_POST_COMMENT}
						InputComponent={components?.Input}
						localization={loc}
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
						{loc.COMMENTS_LOGIN_PROMPT}
					</p>
					{loginHref && (
						<a
							href={loginHref}
							className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4"
							data-testid="login-link"
						>
							{loc.COMMENTS_LOGIN_LINK}
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
	loc,
	expanded,
	replyCount,
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
	loc: CommentsLocalization;
	expanded: boolean;
	/** Pre-computed from the parent comment — avoids an extra fetch on mount. */
	replyCount: number;
	onToggle: () => void;
}) {
	const config = { apiBaseURL, apiBasePath, headers };
	// Only fetch reply bodies once the section is expanded.
	const { comments: replies } = useComments(
		config,
		{
			resourceId,
			resourceType,
			parentId,
			status: "approved",
			currentUserId,
		},
		{ enabled: expanded },
	);

	// Hide when there are no known replies — but keep rendered when already
	// expanded so a freshly-posted first reply (which increments replyCount
	// only after the server responds) stays visible in the same session.
	if (replyCount === 0 && !expanded) return null;

	// Prefer the fetched count (accurate after optimistic inserts); fall back to
	// the server-provided replyCount before the fetch completes.
	const displayCount = expanded ? replies.length || replyCount : replyCount;

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
					{displayCount}{" "}
					{displayCount === 1
						? loc.COMMENTS_REPLIES_SINGULAR
						: loc.COMMENTS_REPLIES_PLURAL}
				</Button>
			)}
			{expanded && (
				<div
					className="border-l-2 border-border pl-3 space-y-0"
					data-testid="replies-list"
				>
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
							loc={loc}
							onReplyClick={() => {}} // No nested replies in v1
						/>
					))}
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs"
						onClick={onToggle}
					>
						{loc.COMMENTS_HIDE_REPLIES}
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
function CommentThreadSkeleton() {
	return (
		<div className="space-y-1">
			{/* Header */}
			<div className="flex items-center gap-2 mb-4">
				<div className="h-5 w-5 rounded bg-muted animate-pulse" />
				<div className="h-4 w-24 rounded bg-muted animate-pulse" />
			</div>

			{/* Comment rows */}
			{[1, 2, 3].map((i) => (
				<div key={i} className="flex gap-3 py-3">
					<div className="h-8 w-8 rounded-full bg-muted shrink-0 mt-0.5 animate-pulse" />
					<div className="flex-1 space-y-2">
						<div className="flex items-center gap-2">
							<div className="h-3 w-20 rounded bg-muted animate-pulse" />
							<div className="h-3 w-14 rounded bg-muted animate-pulse" />
						</div>
						<div className="h-3 w-full rounded bg-muted animate-pulse" />
						<div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
						<div className="flex gap-1 mt-1">
							<div className="h-7 w-12 rounded bg-muted animate-pulse" />
							<div className="h-7 w-14 rounded bg-muted animate-pulse" />
						</div>
					</div>
				</div>
			))}

			{/* Separator */}
			<div className="h-px w-full bg-muted my-4" />

			{/* Textarea placeholder */}
			<div className="space-y-2">
				<div className="h-20 w-full rounded-md border bg-muted animate-pulse" />
				<div className="flex justify-end">
					<div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
				</div>
			</div>
		</div>
	);
}

export function CommentThread(props: CommentThreadProps) {
	return (
		<WhenVisible
			fallback={<CommentThreadSkeleton />}
			rootMargin="300px"
			className={props.className}
		>
			<CommentThreadInner {...props} />
		</WhenVisible>
	);
}
