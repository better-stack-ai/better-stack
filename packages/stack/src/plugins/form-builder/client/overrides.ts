import type { ComponentType } from "react";
import type { FormBuilderLocalization } from "./localization";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";

/**
 * Context passed to lifecycle hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { id: "123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Overridable components and functions for the Form Builder plugin
 *
 * External consumers can provide their own implementations to customize
 * plugin-specific components and behavior.
 */
export interface FormBuilderPluginOverrides {
	/**
	 * Custom field components for AutoForm fields.
	 *
	 * These map field type names to React components. Use these to:
	 * - Override built-in field types (checkbox, date, select, radio, switch, textarea, file, number, fallback)
	 * - Add custom field types for your forms
	 *
	 * @example
	 * ```tsx
	 * fieldComponents: {
	 *   // Override the file type with custom S3 upload
	 *   file: ({ field, label, isRequired }) => (
	 *     <MyS3Upload
	 *       value={field.value}
	 *       onChange={field.onChange}
	 *       label={label}
	 *       required={isRequired}
	 *     />
	 *   ),
	 *   // Add a custom rich text editor
	 *   richText: ({ field, label }) => (
	 *     <MyRichTextEditor value={field.value} onChange={field.onChange} />
	 *   ),
	 * }
	 * ```
	 */
	fieldComponents?: Record<string, ComponentType<AutoFormInputComponentProps>>;

	/**
	 * Localization object for the Form Builder plugin
	 */
	localization?: FormBuilderLocalization;

	/**
	 * Whether to show the attribution
	 */
	showAttribution?: boolean;

	// Lifecycle Hooks (optional)

	/**
	 * Called when a route is rendered
	 * @param routeName - Name of the route (e.g., 'formList', 'formBuilder', 'submissions')
	 * @param context - Route context with path, params, etc.
	 */
	onRouteRender?: (
		routeName: string,
		context: RouteContext,
	) => void | Promise<void>;

	/**
	 * Called when a route encounters an error
	 * @param routeName - Name of the route
	 * @param error - The error that occurred
	 * @param context - Route context
	 */
	onRouteError?: (
		routeName: string,
		error: Error,
		context: RouteContext,
	) => void | Promise<void>;
}
