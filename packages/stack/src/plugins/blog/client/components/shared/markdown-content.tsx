"use client";

import { MarkdownContent as SharedMarkdownContent } from "@workspace/ui/components/markdown-content";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { DefaultImage, DefaultLink } from "./defaults";

// Import blog-specific styles
import "../shared/markdown-content-styles.css";
import "highlight.js/styles/panda-syntax-light.css";

export type MarkdownContentProps = {
	markdown: string;
	className?: string;
};

/**
 * Blog-specific markdown content renderer.
 * This is a thin wrapper around the shared MarkdownContent component
 * that provides blog plugin overrides for Link and Image components.
 */
export function MarkdownContent({ markdown, className }: MarkdownContentProps) {
	const { Link, Image } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		Link: DefaultLink,
		Image: DefaultImage,
	});

	return (
		<SharedMarkdownContent
			markdown={markdown}
			className={className}
			variant="default"
			LinkComponent={Link}
			ImageComponent={Image}
		/>
	);
}
