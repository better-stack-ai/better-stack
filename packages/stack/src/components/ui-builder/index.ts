// Editor component
export {
	default as UIBuilder,
	PageConfigPanel,
	defaultConfigTabsContent,
	LoadingSkeleton,
	getDefaultPanelConfigValues,
} from "@workspace/ui/components/ui-builder";
export type { TabsContentConfig } from "@workspace/ui/components/ui-builder";

// Page renderers
export { default as LayerRenderer } from "@workspace/ui/components/ui-builder/layer-renderer";
export { ServerLayerRenderer } from "@workspace/ui/components/ui-builder/server-layer-renderer";
export type { ServerLayerRendererProps } from "@workspace/ui/components/ui-builder/server-layer-renderer";

// Types
export type {
	ComponentLayer,
	ComponentRegistry,
	Variable,
	VariableReference,
	FunctionRegistry,
	BlockRegistry,
	LayerChangeHandler,
	VariableChangeHandler,
	RegistryEntry,
	PropValue,
	BlockDefinition,
	FunctionDefinition,
} from "@workspace/ui/components/ui-builder/types";
export {
	isVariableReference,
	createVariable,
} from "@workspace/ui/components/ui-builder/types";

// Registry utilities and field override helpers
export {
	createComponentRegistry,
	defaultComponentRegistry,
	primitiveComponentDefinitions,
	complexComponentDefinitions,
} from "../../plugins/ui-builder/client/registry";
export {
	classNameFieldOverrides,
	childrenFieldOverrides,
	iconNameFieldOverrides,
	commonFieldOverrides,
	childrenAsTipTapFieldOverrides,
	childrenAsTextareaFieldOverrides,
} from "@workspace/ui/lib/ui-builder/registry/form-field-overrides";
