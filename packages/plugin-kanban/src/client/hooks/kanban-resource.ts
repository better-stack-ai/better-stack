"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { kanbanResources } from "../../query-keys";
import { KANBAN_PLUGIN_ID } from "../constants";

/**
 * Factory-generated Kanban resource hooks. Internal — public hooks preserve
 * the existing Kanban-specific names and return shapes in `kanban-hooks.tsx`.
 */
export const kanban = createResource({
	plugin: KANBAN_PLUGIN_ID,
	resources: kanbanResources,
});
