/**
 * UI Builder Plugin
 *
 * A visual drag-and-drop page builder that leverages the CMS plugin for data persistence.
 * Provides a default component registry with shadcn/ui components and public page rendering helpers.
 *
 * @example
 * ```typescript
 * // Backend: Add content type to CMS config
 * import { UI_BUILDER_CONTENT_TYPE } from "@btst/stack/plugins/ui-builder"
 *
 * cms: cmsBackendPlugin({
 *   contentTypes: [UI_BUILDER_CONTENT_TYPE]
 * })
 * ```
 *
 * For client-side usage, see `@btst/stack/plugins/ui-builder/client`
 */

// Export schemas and content type configuration
export {
	uiBuilderPageSchema,
	UI_BUILDER_CONTENT_TYPE,
	UI_BUILDER_TYPE_SLUG,
	type UIBuilderPageSchemaType,
} from "./schemas";

// Export types
export type {
	UIBuilderPageData,
	ParsedUIBuilderPage,
	UIBuilderPage,
	SerializedUIBuilderPage,
	PaginatedUIBuilderPages,
	LoaderContext,
	UIBuilderClientHooks,
	ComponentLayer,
	Variable,
	ComponentRegistry,
	RegistryEntry,
} from "./types";
