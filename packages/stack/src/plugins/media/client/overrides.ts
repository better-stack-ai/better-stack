import type { ComponentType } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { ImageCompressionOptions } from "./utils/image-compression";

/**
 * Upload mode — must match the storage adapter configured in mediaBackendPlugin.
 * - `"direct"` — local filesystem adapter, files are uploaded via `POST /media/upload`
 * - `"s3"` — AWS S3 / R2 / MinIO, the client fetches a presigned token then PUTs directly to S3
 * - `"vercel-blob"` — Vercel Blob, uses the `@vercel/blob/client` SDK for direct upload
 */
export type MediaUploadMode = "direct" | "s3" | "vercel-blob";

/**
 * Overridable components and functions for the Media plugin.
 *
 * External consumers provide these when registering the media client plugin
 * via the StackProvider overrides.
 */
export interface MediaPluginOverrides {
	/**
	 * Base URL for API calls (e.g., "http://localhost:3000").
	 */
	apiBaseURL: string;

	/**
	 * Path where the API is mounted (e.g., "/api/data").
	 */
	apiBasePath: string;

	/**
	 * React Query client — used by the MediaPicker to cache and fetch assets.
	 */
	queryClient: QueryClient;

	/**
	 * Upload mode — must match the storageAdapter configured in mediaBackendPlugin.
	 * @default "direct"
	 */
	uploadMode?: MediaUploadMode;

	/**
	 * Optional headers to pass with API requests (e.g., for SSR auth).
	 */
	headers?: HeadersInit;

	/**
	 * Navigation function for programmatic navigation.
	 */
	navigate: (path: string) => void | Promise<void>;

	/**
	 * Link component for navigation within the media library page.
	 */
	Link?: ComponentType<React.ComponentProps<"a"> & Record<string, any>>;

	/**
	 * Image component for rendering asset thumbnails and previews.
	 *
	 * When provided, replaces the default `<img>` element in asset cards,
	 * the media library grid, and the ImageInputField preview. Use this
	 * to plug in Next.js `<Image>` for automatic optimisation.
	 *
	 * @example
	 * ```tsx
	 * Image: (props) => <NextImage {...props} />
	 * ```
	 */
	Image?: ComponentType<
		React.ImgHTMLAttributes<HTMLImageElement> & Record<string, any>
	>;

	/**
	 * Client-side image compression applied before upload via the Canvas API.
	 *
	 * Images are scaled down to fit within `maxWidth` × `maxHeight` (preserving
	 * aspect ratio) and re-encoded at `quality`. SVG and GIF files are always
	 * passed through unchanged.
	 *
	 * Set to `false` to disable compression entirely.
	 *
	 * @default { maxWidth: 2048, maxHeight: 2048, quality: 0.85 }
	 */
	imageCompression?: ImageCompressionOptions | false;

	// ============ Lifecycle Hooks ============

	/**
	 * Called when a media route is rendered.
	 */
	onRouteRender?: (
		routeName: string,
		context: MediaRouteContext,
	) => void | Promise<void>;

	/**
	 * Called when a media route encounters an error.
	 */
	onRouteError?: (
		routeName: string,
		error: Error,
		context: MediaRouteContext,
	) => void | Promise<void>;

	/**
	 * Called before the media library page is rendered.
	 * Return `false` to prevent rendering (e.g., redirect unauthenticated users).
	 *
	 * @example
	 * ```ts
	 * media: {
	 *   onBeforeLibraryPageRendered: (context) => !!currentUser?.isAdmin,
	 *   onRouteError: (routeName, error, context) => navigate("/login"),
	 * }
	 * ```
	 */
	onBeforeLibraryPageRendered?: (context: MediaRouteContext) => boolean;
}

export interface MediaRouteContext {
	/** Current route path */
	path: string;
	/** Route parameters */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	[key: string]: unknown;
}
