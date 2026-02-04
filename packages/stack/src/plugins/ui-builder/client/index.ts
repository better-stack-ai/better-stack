// UI Builder client plugin
export {
	uiBuilderClientPlugin,
	type UIBuilderClientConfig,
} from "./plugin";

// Default component registry
export {
	defaultComponentRegistry,
	createComponentRegistry,
	primitiveComponentDefinitions,
	complexComponentDefinitions,
} from "./registry";

// Field override helpers for custom component registries
export {
	classNameFieldOverrides,
	childrenFieldOverrides,
	iconNameFieldOverrides,
	commonFieldOverrides,
	childrenAsTipTapFieldOverrides,
	childrenAsTextareaFieldOverrides,
} from "@workspace/ui/lib/ui-builder/registry/form-field-overrides";

// Page rendering components
export {
	PageRenderer,
	SuspensePageRenderer,
	type PageRendererProps,
} from "./components/page-renderer";

// Admin page components
export { PageListPage } from "./components/pages/page-list-page";
export { PageBuilderPage } from "./components/pages/page-builder-page";

// Hooks
export {
	// List hooks
	useUIBuilderPages,
	useSuspenseUIBuilderPages,
	// Single page hooks
	useUIBuilderPage,
	useSuspenseUIBuilderPage,
	useUIBuilderPageBySlug,
	useSuspenseUIBuilderPageBySlug,
	// Mutation hooks
	useCreateUIBuilderPage,
	useUpdateUIBuilderPage,
	useDeleteUIBuilderPage,
	// Types
	type UseUIBuilderPagesOptions,
	type UseUIBuilderPagesResult,
	type CreateUIBuilderPageInput,
	type UpdateUIBuilderPageInput,
} from "./hooks/ui-builder-hooks";

// Localization
export {
	uiBuilderLocalization,
	type UIBuilderLocalization,
} from "./localization";

// Re-export types
export type { UIBuilderPluginOverrides } from "./overrides";
