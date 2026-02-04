"use client";

import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { DefaultLink } from "./defaults";
import { Badge } from "@workspace/ui/components/badge";
import { useSuspenseTags } from "../../hooks/blog-hooks";

export function TagsList() {
	const { tags } = useSuspenseTags();
	const { Link } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		Link: DefaultLink,
	});
	const basePath = useBasePath();

	if (!tags || tags.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-wrap gap-2 justify-center">
			{tags.map((tag) => (
				<Link key={tag.id} href={`${basePath}/blog/tag/${tag.slug}`}>
					<Badge variant="secondary" className="text-xs">
						{tag.name}
					</Badge>
				</Link>
			))}
		</div>
	);
}
