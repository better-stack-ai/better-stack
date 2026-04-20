"use client";

import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { DefaultLink } from "./defaults";
import { Badge } from "@workspace/ui/components/badge";
import { BLOG_LOCALIZATION } from "../../localization";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { SerializedTag } from "../../../types";

const MAX_VISIBLE_TAGS = 15;

interface CollapsibleTagListProps {
	tags: SerializedTag[];
	maxVisible?: number;
}

export function CollapsibleTagList({
	tags,
	maxVisible = MAX_VISIBLE_TAGS,
}: CollapsibleTagListProps) {
	const { Link, localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		Link: DefaultLink,
		localization: BLOG_LOCALIZATION,
	});
	const basePath = useBasePath();
	const [showAll, setShowAll] = useState(false);

	if (!tags || tags.length === 0) {
		return null;
	}

	const hasMore = tags.length > maxVisible;
	const visibleTags = showAll || !hasMore ? tags : tags.slice(0, maxVisible);

	return (
		<>
			{visibleTags.map((tag) => (
				<Link key={tag.id} href={`${basePath}/blog/tag/${tag.slug}`}>
					<Badge variant="secondary" className="text-xs">
						{tag.name}
					</Badge>
				</Link>
			))}
			{hasMore && (
				<Badge asChild variant="secondary" className="text-xs cursor-pointer">
					<button
						type="button"
						onClick={() => setShowAll((prev) => !prev)}
						aria-expanded={showAll}
						aria-label={
							showAll
								? localization.BLOG_TAGS_SHOW_LESS
								: localization.BLOG_TAGS_SHOW_ALL
						}
						title={
							showAll
								? localization.BLOG_TAGS_SHOW_LESS
								: localization.BLOG_TAGS_SHOW_ALL
						}
					>
						{showAll ? (
							<ChevronUp aria-hidden="true" />
						) : (
							<ChevronDown aria-hidden="true" />
						)}
					</button>
				</Badge>
			)}
		</>
	);
}
