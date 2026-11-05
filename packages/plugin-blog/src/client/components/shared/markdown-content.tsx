"use client";

import type { ReactNode } from "react";
import { MarkdownContent as SharedMarkdownContent } from "@workspace/ui/components/markdown-content";
import { useStack } from "@btst/stack/context";
import { DefaultImage, DefaultLink } from "./defaults";

// Import blog-specific styles
import "../shared/markdown-content-styles.css";
import "highlight.js/styles/panda-syntax-light.css";

export type MarkdownContentProps = {
	markdown: string;
	className?: string;
	afterFirstParagraph?: ReactNode;
};

/**
 * Blog-specific markdown content renderer.
 * This is a thin wrapper around the shared MarkdownContent component
 * that provides the framework-wide Link and Image components.
 */
export function MarkdownContent({
	markdown,
	className,
	afterFirstParagraph,
}: MarkdownContentProps) {
	const { router } = useStack();
	const Link = router?.Link ?? DefaultLink;
	const Image = router?.Image ?? DefaultImage;

	return (
		<SharedMarkdownContent
			markdown={markdown}
			afterFirstParagraph={afterFirstParagraph}
			className={className}
			variant="default"
			LinkComponent={Link}
			ImageComponent={Image}
		/>
	);
}
