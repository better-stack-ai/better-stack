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
 * External consumers can provide their own implementations of these
 * to customize the behavior for their framework (Next.js, React Router, etc.)
 */
export interface FormBuilderPluginOverrides {
	/**
	 * Link component for navigation
	 */
	Link?: ComponentType<React.ComponentProps<"a"> & Record<string, unknown>>;

	/**
	 * Navigation function for programmatic navigation
	 */
	navigate: (path: string) => void | Promise<void>;

	/**
	 * Refresh function to invalidate server-side cache (e.g., Next.js router.refresh())
	 */
	refresh?: () => void | Promise<void>;

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
	 * API base URL
	 */
	apiBaseURL: string;

	/**
	 * API base path
	 */
	apiBasePath: string;

	/**
	 * Whether to show the attribution
	 */
	showAttribution?: boolean;

	/**
	 * Optional headers to pass with API requests (e.g., for SSR auth)
	 */
	headers?: HeadersInit;

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

	/**
	 * Called before the form list page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforeFormListRendered?: (context: RouteContext) => boolean;

	/**
	 * Called before the form builder page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param id - The form ID (null for new forms)
	 * @param context - Route context
	 */
	onBeforeFormBuilderRendered?: (
		id: string | null,
		context: RouteContext,
	) => boolean;

	/**
	 * Called before the submissions page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param formId - The form ID
	 * @param context - Route context
	 */
	onBeforeSubmissionsRendered?: (
		formId: string,
		context: RouteContext,
	) => boolean;
}
