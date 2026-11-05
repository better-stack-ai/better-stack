export { formBuilderClientPlugin } from "./plugin";
export type {
	FormBuilderClientConfig,
	FormBuilderClientHooks,
	LoaderContext,
} from "./plugin";
export type { FormBuilderPluginOverrides, RouteContext } from "./overrides";
export type { FormBuilderLocalization } from "./localization";

// Re-export AutoFormInputComponentProps for custom field components
export type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";

// Re-export schema converter utilities
export {
	zodToFormSchema,
	formSchemaToZod,
	hasSteps,
	getSteps,
	getStepGroupMap,
	type FormStep,
	type FormSchemaMetadata,
} from "@workspace/ui/lib/schema-converter";
