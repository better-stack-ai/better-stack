"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { formBuilderResources } from "../../query-keys";
import { FORM_BUILDER_PLUGIN_ID } from "../constants";

/**
 * Factory-generated Form Builder resource hooks. Internal — the public hook
 * surface (`useForms`, `useFormById`, ...) in `form-builder-hooks.tsx` wraps
 * these.
 */
export const formBuilder = createResource({
	plugin: FORM_BUILDER_PLUGIN_ID,
	resources: formBuilderResources,
});
