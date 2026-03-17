"use client";

import { useEffect, useState, type ComponentType } from "react";
import { WhenVisible } from "@workspace/ui/components/when-visible";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Separator } from "@workspace/ui/components/separator";
import {
	Heart,
	MessageSquare,
	Pencil,
	X,
	LogIn,
	ChevronDown,
	ChevronUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SerializedComment } from "../../types";
import { getInitials } from "../utils";
import { CommentForm } from "./comment-form";
import {
	useComments,
	useInfiniteComments,
	usePostComment,
	useUpdateComment,
	useDeleteComment,
	useToggleLike,
} from "../hooks/use-comments";
import {
	COMMENTS_LOCALIZATION,
	type CommentsLocalization,
} from "../localization";
import { usePluginOverrides } from "@btst/stack/context";
import type { CommentsPluginOverrides } from "../overrides";

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
	/**
	 * Number of top-level comments to load per page.
	 * Clicking "Load more" fetches the next page. Default: 10.
	 */
	pageSize?: number;
	/**
	 * When false, the comment form and reply buttons are hidden.
	 * Overrides the global `allowPosting` from `CommentsPluginOverrides`.
	 * Defaults to true.
	 */
	allowPosting?: boolean;
	/**
	 * When false, the edit button is hidden on comment cards.
	 * Overrides the global `allowEditing` from `CommentsPluginOverrides`.
	 * Defaults to true.
	 */
	allowEditing?: boolean;
}

const DEFAULT_RENDERER: ComponentType<CommentRendererProps> = ({ body }) => (
	<p className="text-sm whitespace-pre-wrap break-words">{body}</p>
);

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
	infiniteKey,
	onReplyClick,
	allowPosting,
	allowEditing,
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
	/** Infinite thread query key — pass for top-level comments so like optimistic
	 *  updates target the correct InfiniteData cache entry. */
	infiniteKey?: readonly unknown[];
	onReplyClick: (parentId: string) => void;
	allowPosting: boolean;
	allowEditing: boolean;
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
		infiniteKey,
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

						{allowPosting &&
							currentUserId &&
							!comment.parentId &&
							isApproved && (
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
								{allowEditing && isApproved && (
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

const DEFAULT_PAGE_SIZE = 100;
const REPLIES_PAGE_SIZE = 20;

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
	pageSize: pageSizeProp,
	allowPosting: allowPostingProp,
	allowEditing: allowEditingProp,
}: CommentThreadProps) {
	const overrides = usePluginOverrides<
		CommentsPluginOverrides,
		Partial<CommentsPluginOverrides>
	>("comments", {});
	const pageSize =
		pageSizeProp ?? overrides.defaultCommentPageSize ?? DEFAULT_PAGE_SIZE;
	const allowPosting = allowPostingProp ?? overrides.allowPosting ?? true;
	const allowEditing = allowEditingProp ?? overrides.allowEditing ?? true;
	const loc = { ...COMMENTS_LOCALIZATION, ...localizationProp };
	const [replyingTo, setReplyingTo] = useState<string | null>(null);
	const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
		new Set(),
	);
	const [replyOffsets, setReplyOffsets] = useState<Record<string, number>>({});

	const config = { apiBaseURL, apiBasePath, headers };

	const {
		comments,
		total,
		isLoading,
		loadMore,
		hasMore,
		isLoadingMore,
		queryKey: threadQueryKey,
	} = useInfiniteComments(config, {
		resourceId,
		resourceType,
		status: "approved",
		parentId: null,
		currentUserId,
		pageSize,
	});

	const postMutation = usePostComment(config, {
		resourceId,
		resourceType,
		currentUserId,
		infiniteKey: threadQueryKey,
		pageSize,
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
			limit: REPLIES_PAGE_SIZE,
			offset: replyOffsets[parentId] ?? 0,
		});
		setReplyingTo(null);
		setExpandedReplies((prev) => new Set(prev).add(parentId));
	};

	return (
		<div className="space-y-1" data-testid="comment-thread">
			<div className="flex items-center gap-2 mb-4">
				<MessageSquare className="h-5 w-5 text-muted-foreground" />
				<h3 className="font-semibold text-sm">
					{total === 0 ? loc.COMMENTS_TITLE : `${total} ${loc.COMMENTS_TITLE}`}
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

			{!isLoading && comments.length > 0 && (
				<div className="divide-y divide-border">
					{comments.map((comment) => (
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
								infiniteKey={threadQueryKey}
								onReplyClick={(parentId) => {
									setReplyingTo(replyingTo === parentId ? null : parentId);
								}}
								allowPosting={allowPosting}
								allowEditing={allowEditing}
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
								onOffsetChange={(offset) => {
									setReplyOffsets((prev) => {
										if (prev[comment.id] === offset) return prev;
										return { ...prev, [comment.id]: offset };
									});
								}}
								allowEditing={allowEditing}
							/>

							{allowPosting && replyingTo === comment.id && currentUserId && (
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

			{!isLoading && comments.length === 0 && (
				<p className="text-sm text-muted-foreground py-4 text-center">
					{loc.COMMENTS_EMPTY}
				</p>
			)}

			{hasMore && (
				<div className="flex justify-center pt-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => loadMore()}
						disabled={isLoadingMore}
						data-testid="load-more-comments"
					>
						{isLoadingMore ? loc.COMMENTS_LOADING_MORE : loc.COMMENTS_LOAD_MORE}
					</Button>
				</div>
			)}

			{allowPosting && (
				<>
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
				</>
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
	onOffsetChange,
	allowEditing,
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
	onOffsetChange: (offset: number) => void;
	allowEditing: boolean;
}) {
	const config = { apiBaseURL, apiBasePath, headers };
	const [replyOffset, setReplyOffset] = useState(0);
	const [loadedReplies, setLoadedReplies] = useState<SerializedComment[]>([]);
	// Only fetch reply bodies once the section is expanded.
	const {
		comments: repliesPage,
		total: repliesTotal,
		isFetching: isFetchingReplies,
	} = useComments(
		config,
		{
			resourceId,
			resourceType,
			parentId,
			status: "approved",
			currentUserId,
			limit: REPLIES_PAGE_SIZE,
			offset: replyOffset,
		},
		{ enabled: expanded },
	);

	useEffect(() => {
		if (expanded) {
			setReplyOffset(0);
			setLoadedReplies([]);
		}
	}, [expanded, parentId]);

	useEffect(() => {
		onOffsetChange(replyOffset);
	}, [onOffsetChange, replyOffset]);

	useEffect(() => {
		if (!expanded) return;
		setLoadedReplies((prev) => {
			const byId = new Map(prev.map((item) => [item.id, item]));
			for (const reply of repliesPage) {
				byId.set(reply.id, reply);
			}
			return Array.from(byId.values());
		});
	}, [expanded, repliesPage]);

	// Hide when there are no known replies — but keep rendered when already
	// expanded so a freshly-posted first reply (which increments replyCount
	// only after the server responds) stays visible in the same session.
	if (replyCount === 0 && !expanded) return null;

	// Prefer the fetched count (accurate after optimistic inserts); fall back to
	// the server-provided replyCount before the fetch completes.
	const displayCount = expanded
		? loadedReplies.length || replyCount
		: replyCount;
	const effectiveReplyTotal = repliesTotal || replyCount;
	const hasMoreReplies = loadedReplies.length < effectiveReplyTotal;

	return (
		<div className="pl-11">
			{/* Toggle button — always at the top so collapse is reachable without scrolling */}
			<Button
				variant="ghost"
				size="sm"
				className="h-7 px-2 text-xs mb-1"
				onClick={onToggle}
				data-testid={expanded ? "hide-replies-button" : "show-replies-button"}
			>
				{expanded ? (
					<ChevronUp className="h-3 w-3 mr-1" />
				) : (
					<ChevronDown className="h-3 w-3 mr-1" />
				)}
				{expanded
					? loc.COMMENTS_HIDE_REPLIES
					: `${displayCount} ${displayCount === 1 ? loc.COMMENTS_REPLIES_SINGULAR : loc.COMMENTS_REPLIES_PLURAL}`}
			</Button>
			{expanded && (
				<div
					className="border-l-2 border-border pl-3 space-y-0"
					data-testid="replies-list"
				>
					{loadedReplies.map((reply) => (
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
							allowPosting={false}
							allowEditing={allowEditing}
						/>
					))}
					{hasMoreReplies && (
						<div className="py-2">
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={() =>
									setReplyOffset((prev) => prev + REPLIES_PAGE_SIZE)
								}
								disabled={isFetchingReplies}
								data-testid="load-more-replies"
							>
								{isFetchingReplies
									? loc.COMMENTS_LOADING_MORE
									: loc.COMMENTS_LOAD_MORE}
							</Button>
						</div>
					)}
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
		<div id="comments" className={props.className}>
			<WhenVisible fallback={<CommentThreadSkeleton />} rootMargin="300px">
				<CommentThreadInner {...props} />
			</WhenVisible>
		</div>
	);
}
