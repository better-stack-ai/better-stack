"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { mediaResources } from "../../query-keys";

/** Factory-generated hooks shared by the public Media hook wrappers. */
export const media = createResource({
	plugin: "media",
	resources: mediaResources,
});
