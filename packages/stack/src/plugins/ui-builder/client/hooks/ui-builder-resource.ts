"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { uiBuilderResources } from "../../query-keys";

/** Internal generated resource; public hooks remain in ui-builder-hooks.tsx. */
export const uiBuilder = createResource({
	plugin: "ui-builder",
	resources: uiBuilderResources,
});
