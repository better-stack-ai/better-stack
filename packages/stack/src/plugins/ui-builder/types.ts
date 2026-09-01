import type {
	ComponentLayer,
	Variable,
} from "@workspace/ui/components/ui-builder/types";

/**
 * UI Builder Page data structure
 * This represents the parsed content from the CMS content item
 */
export interface UIBuilderPageData {
	/** JSON-serialized ComponentLayer[] representing the page structure */
	layers: string;
	/** JSON-serialized Variable[] for dynamic content */
	variables: string;
	/** Page publication status */
	status: "published" | "draft" | "archived";
}

/**
 * Parsed UI Builder Page with deserialized layers and variables
 */
export interface ParsedUIBuilderPage {
	/** Deserialized page layers */
	layers: ComponentLayer[];
	/** Deserialized variables */
	variables: Variable[];
	/** Page publication status */
	status: "published" | "draft" | "archived";
}

/**
 * UI Builder Page stored in CMS (via content item)
 */
export interface UIBuilderPage {
	id: string;
	/** URL-friendly slug - unique identifier */
	slug: string;
	/** Page data containing layers, variables, status */
	data: UIBuilderPageData;
	createdAt: string;
	updatedAt: string;
}

/**
 * Serialized UI Builder Page for API responses
 */
export interface SerializedUIBuilderPage {
	id: string;
	contentTypeId: string;
	slug: string;
	data: string;
	authorId?: string;
	createdAt: string;
	updatedAt: string;
	/** Parsed data from JSON */
	parsedData: UIBuilderPageData;
}

/**
 * Paginated list response for UI Builder pages
 */
export interface PaginatedUIBuilderPages {
	items: SerializedUIBuilderPage[];
	total: number;
	limit: number;
	offset: number;
}

/**
 * Context passed to loader hooks
 */
export interface LoaderContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { id: "123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Base URL for API calls */
	apiBaseURL: string;
	/** Path where the API is mounted */
	apiBasePath: string;
	/** Optional headers for the request */
	headers?: Headers;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Hooks for UI Builder client plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface UIBuilderClientHooks {
	/**
	 * Called before loading the page list. If it throws, remaining loader work
	 * stops, `onErrorLoad` is notified, and the loader still resolves.
	 * @param context - Loader context with path, params, etc.
	 */
	beforeLoadPageList?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called after the page list is loaded.
	 * @param context - Loader context
	 */
	afterLoadPageList?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called before loading the page builder. If it throws, remaining loader work
	 * stops, `onErrorLoad` is notified, and the loader still resolves.
	 * @param pageId - The page ID (undefined for new pages)
	 * @param context - Loader context
	 */
	beforeLoadPageBuilder?: (
		pageId: string | undefined,
		context: LoaderContext,
	) => Promise<void> | void;
	/**
	 * Called after the page builder is loaded.
	 * @param pageId - The page ID (undefined for new pages)
	 * @param context - Loader context
	 */
	afterLoadPageBuilder?: (
		pageId: string | undefined,
		context: LoaderContext,
	) => Promise<void> | void;
	/**
	 * Called when a loading error occurs.
	 * This is a reporting-only observer. Callback errors are contained and the
	 * loader never rejects, so throwing framework redirects are not supported.
	 * @param error - The error that occurred
	 * @param context - Loader context
	 */
	onErrorLoad?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

// Re-export types from ui-builder for convenience
export type {
	ComponentLayer,
	Variable,
	ComponentRegistry,
	RegistryEntry,
	FunctionRegistry,
} from "@workspace/ui/components/ui-builder/types";
