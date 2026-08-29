"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { uiBuilderResources } from "../../query-keys";
import { UI_BUILDER_PLUGIN_ID } from "../constants";

/** Internal generated resource; public hooks remain in ui-builder-hooks.tsx. */
export const uiBuilder = createResource({
	plugin: UI_BUILDER_PLUGIN_ID,
	resources: uiBuilderResources,
});
