"use client";

import { useSuspenseTags } from "../../hooks/blog-hooks";
import { CollapsibleTagList } from "./collapsible-tag-list";

export function TagsList() {
	const { tags } = useSuspenseTags();

	if (!tags || tags.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap gap-2 justify-center">
			<CollapsibleTagList tags={tags} />
		</div>
	);
}
