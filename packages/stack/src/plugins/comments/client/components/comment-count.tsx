"use client";

import { MessageSquare } from "lucide-react";
import { useStack } from "@btst/stack/context";
import { useCommentCount } from "../hooks/use-comments";

export interface CommentCountProps {
	resourceId: string;
	resourceType: string;
	/** Only count approved comments (default) */
	status?: "pending" | "approved" | "spam";
	/** Optional className for the wrapper span */
	className?: string;
}

/**
 * Lightweight badge showing the comment count for a resource.
 * Does not mount a full comment thread — suitable for post list cards.
 *
 * @example
 * ```tsx
 * <CommentCount
 *   resourceId={post.slug}
 *   resourceType="blog-post"
 * />
 * ```
 */
export function CommentCount({
	resourceId,
	resourceType,
	status = "approved",
	className,
}: CommentCountProps) {
	const { api } = useStack();
	const { count, isLoading } = useCommentCount(
		{ apiBaseURL: api?.baseURL ?? "", apiBasePath: api?.basePath ?? "" },
		{ resourceId, resourceType, status },
	);

	if (isLoading) {
		return (
			<span
				className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className ?? ""}`}
			>
				<MessageSquare className="h-3.5 w-3.5" />
				<span className="animate-pulse">…</span>
			</span>
		);
	}

	return (
		<span
			className={`inline-flex items-center gap-1 text-xs text-muted-foreground ${className ?? ""}`}
			data-testid="comment-count"
		>
			<MessageSquare className="h-3.5 w-3.5" />
			{count}
		</span>
	);
}
