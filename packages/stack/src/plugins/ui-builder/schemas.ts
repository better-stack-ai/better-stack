import { z } from "zod";
import type { ContentTypeConfig } from "../cms/types";

/**
 * Zod schema for UI Builder page data
 * This schema defines the structure of data stored in CMS content items
 */
export const uiBuilderPageSchema = z.object({
	/** JSON-serialized ComponentLayer[] representing the page structure */
	layers: z.string().meta({ fieldType: "textarea" }),
	/** JSON-serialized Variable[] for dynamic content */
	variables: z.string().default("[]").meta({ fieldType: "textarea" }),
	/** Page publication status */
	status: z
		.enum(["published", "draft", "archived"])
		.default("draft")
		.meta({ fieldType: "select" }),
});

/**
 * Pre-configured content type for UI Builder pages
 * Add this to your CMS plugin configuration to enable UI Builder
 *
 * @example
 * ```typescript
 * import { UI_BUILDER_CONTENT_TYPE } from "@btst/stack/plugins/ui-builder"
 *
 * cms: cmsBackendPlugin({
 *   contentTypes: [
 *     UI_BUILDER_CONTENT_TYPE,
 *     // ... other content types
 *   ]
 * })
 * ```
 */
export const UI_BUILDER_CONTENT_TYPE: ContentTypeConfig = {
	name: "UI Builder Page",
	slug: "ui-builder-page",
	description: "Visual drag-and-drop page builder pages",
	schema: uiBuilderPageSchema,
};

/**
 * Content type slug constant for use in queries
 */
export const UI_BUILDER_TYPE_SLUG = "ui-builder-page" as const;

export type UIBuilderPageSchemaType = z.infer<typeof uiBuilderPageSchema>;
