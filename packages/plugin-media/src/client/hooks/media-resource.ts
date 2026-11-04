"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { mediaResources } from "../../query-keys";
import { MEDIA_PLUGIN_ID } from "../constants";

/** Factory-generated hooks shared by the public Media hook wrappers. */
export const media = createResource({
	plugin: MEDIA_PLUGIN_ID,
	resources: mediaResources,
});
