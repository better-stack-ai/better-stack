"use client";

import { createResource } from "@btst/stack/plugins/client/hooks";
import { formBuilderResources } from "../../query-keys";

/**
 * Factory-generated Form Builder resource hooks. Internal — the public hook
 * surface (`useForms`, `useFormById`, ...) in `form-builder-hooks.tsx` wraps
 * these.
 */
export const formBuilder = createResource({
	plugin: "form-builder",
	resources: formBuilderResources,
});
