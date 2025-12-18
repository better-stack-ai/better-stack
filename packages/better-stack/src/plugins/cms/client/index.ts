export { cmsClientPlugin } from "./plugin";
export type { CMSClientConfig, LoaderContext } from "./plugin";
export type { CMSPluginOverrides, RouteContext } from "./overrides";
export type { CMSLocalization } from "./localization";

// Re-export AutoFormInputComponentProps for custom field components
export type { AutoFormInputComponentProps } from "@workspace/ui/components/ui/auto-form/types";

// Export CMSFileUpload for consumers to use or extend
export {
	CMSFileUpload,
	type CMSFileUploadProps,
} from "./components/forms/file-upload";
