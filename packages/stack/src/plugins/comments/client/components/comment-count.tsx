"use client";

import { MessageSquare } from "lucide-react";
import { useCommentCount } from "../hooks/use-comments";

export interface CommentCountProps {
	resourceId: string;
	resourceType: string;
	/** Only count approved comments (default) */
	status?: "pending" | "approved" | "spam";
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
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
 *   apiBaseURL="https://example.com"
 *   apiBasePath="/api/data"
 * />
 * ```
 */
export function CommentCount({
	resourceId,
	resourceType,
	status = "approved",
	apiBaseURL,
	apiBasePath,
	headers,
	className,
}: CommentCountProps) {
	const { count, isLoading } = useCommentCount(
		{ apiBaseURL, apiBasePath, headers },
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
