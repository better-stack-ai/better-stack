"use client";

import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { DefaultLink } from "./defaults";
import { Badge } from "@workspace/ui/components/badge";
import { useSuspenseTags } from "../../hooks/blog-hooks";
import { BLOG_LOCALIZATION } from "../../localization";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

const MAX_VISIBLE_TAGS = 15;

export function TagsList() {
	const { tags } = useSuspenseTags();
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

	const hasMore = tags.length > MAX_VISIBLE_TAGS;
	const visibleTags =
		showAll || !hasMore ? tags : tags.slice(0, MAX_VISIBLE_TAGS);

	return (
		<div className="flex flex-wrap gap-2 justify-center">
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
		</div>
	);
}
