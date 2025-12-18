import type { ComponentType } from "react";
import type { CMSLocalization } from "./localization";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/ui/auto-form/types";

/**
 * Context passed to lifecycle hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { typeSlug: "product", id: "123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Overridable components and functions for the CMS plugin
 *
 * External consumers can provide their own implementations of these
 * to customize the behavior for their framework (Next.js, React Router, etc.)
 */
export interface CMSPluginOverrides {
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
	 * Image component for displaying images
	 */
	Image?: ComponentType<
		React.ImgHTMLAttributes<HTMLImageElement> & Record<string, unknown>
	>;

	/**
	 * Function used to upload an image and return its URL.
	 * Used by the default "file" field component.
	 */
	uploadImage?: (file: File) => Promise<string>;

	/**
	 * Custom field components for AutoForm fields.
	 *
	 * These map field type names to React components. Use these to:
	 * - Override built-in field types (checkbox, date, select, radio, switch, textarea, file, number, fallback)
	 * - Add custom field types for your content types
	 *
	 * The component receives AutoFormInputComponentProps which includes:
	 * - field: react-hook-form field controller
	 * - label: the field label
	 * - isRequired: whether the field is required
	 * - fieldConfigItem: the field config (description, inputProps, etc.)
	 * - fieldProps: additional props from fieldConfig.inputProps
	 * - zodItem: the Zod schema for this field
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
	 * Localization object for the CMS plugin
	 */
	localization?: CMSLocalization;

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
	 * @param routeName - Name of the route (e.g., 'dashboard', 'contentList', 'contentEditor')
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
	 * Called before the dashboard page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforeDashboardRendered?: (context: RouteContext) => boolean;

	/**
	 * Called before the content list page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param typeSlug - The content type slug
	 * @param context - Route context
	 */
	onBeforeListRendered?: (typeSlug: string, context: RouteContext) => boolean;

	/**
	 * Called before the content editor page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param typeSlug - The content type slug
	 * @param id - The content item ID (null for new items)
	 * @param context - Route context
	 */
	onBeforeEditorRendered?: (
		typeSlug: string,
		id: string | null,
		context: RouteContext,
	) => boolean;
}
