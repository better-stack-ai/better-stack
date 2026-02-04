export { cmsClientPlugin } from "./plugin";
export type { CMSClientConfig, CMSClientHooks, LoaderContext } from "./plugin";
export type { CMSPluginOverrides, RouteContext } from "./overrides";
export type { CMSLocalization } from "./localization";

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

// Export CMSFileUpload for consumers to use or extend
export {
	CMSFileUpload,
	type CMSFileUploadProps,
} from "./components/forms/file-upload";
