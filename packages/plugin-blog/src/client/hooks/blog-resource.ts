"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { blogResources } from "../../query-keys";
import { BLOG_PLUGIN_ID } from "../constants";

/**
 * Factory-generated blog resource hooks. Internal — the public hook surface
 * (`usePosts`, `useSuspensePost`, ...) in `blog-hooks.tsx` wraps these.
 */
export const blog = createResource({
	plugin: BLOG_PLUGIN_ID,
	resources: blogResources,
});
