"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { cmsResources } from "../../query-keys";

/**
 * Factory-generated CMS resource hooks. Internal — the public hook surface
 * (`useContent`, `useContentTypes`, ...) in `cms-hooks.tsx` wraps these.
 */
export const cms = createResource({
	plugin: "cms",
	resources: cmsResources,
});
