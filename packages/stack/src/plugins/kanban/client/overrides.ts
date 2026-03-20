import type { ComponentType, ReactNode } from "react";
import type { KanbanLocalization } from "./localization";
import type { SerializedTask } from "../types";

/**
 * User information for assignee display/selection
 * Framework-agnostic - consumers map their auth system to this shape
 */
export interface KanbanUser {
	id: string;
	name: string;
	avatarUrl?: string;
	email?: string;
}

/**
 * Context passed to lifecycle hooks
 */
export interface RouteContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { boardId: "abc123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Overridable components and functions for the Kanban plugin
 *
 * External consumers can provide their own implementations of these
 * to customize the behavior for their framework (Next.js, React Router, etc.)
 */
export interface KanbanPluginOverrides {
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
	 * Localization object for the kanban plugin
	 */
	localization?: KanbanLocalization;
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

	/**
	 * Function used to upload a new image file from the task description editor
	 * and return its URL. This is separate from `imagePicker`, which selects an
	 * existing asset URL.
	 */
	uploadImage?: (file: File) => Promise<string>;

	/**
	 * Optional trigger component for a media picker.
	 * When provided, it appears inside the image insertion dialog of the task description editor,
	 * letting users browse and select previously uploaded assets.
	 *
	 * @example
	 * ```tsx
	 * imagePicker: ({ onSelect }) => (
	 *   <MediaPicker
	 *     trigger={<Button size="sm" variant="outline">Browse media</Button>}
	 *     accept={["image/*"]}
	 *     onSelect={(assets) => onSelect(assets[0].url)}
	 *   />
	 * )
	 * ```
	 */
	imagePicker?: ComponentType<{ onSelect: (url: string) => void }>;

	// ============ User Resolution (required for assignee features) ============

	/**
	 * Resolve user info from an assigneeId
	 * Called when rendering task cards/forms that have an assignee
	 * Return null for unknown users (will show fallback UI)
	 */
	resolveUser: (
		userId: string,
	) => Promise<KanbanUser | null> | KanbanUser | null;

	/**
	 * Search/list users available for assignment
	 * Called when user opens the assignee picker
	 * @param query - Search query (empty string for initial load)
	 * @param boardId - Optional board context for scoped user lists
	 */
	searchUsers: (
		query: string,
		boardId?: string,
	) => Promise<KanbanUser[]> | KanbanUser[];

	// ============ Lifecycle Hooks (optional) ============

	/**
	 * Called when a route is rendered
	 * @param routeName - Name of the route (e.g., 'boards', 'board', 'newBoard')
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
	 * Called before the boards list page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforeBoardsPageRendered?: (context: RouteContext) => boolean;

	/**
	 * Called before a single board page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param boardId - The board ID
	 * @param context - Route context
	 */
	onBeforeBoardPageRendered?: (
		boardId: string,
		context: RouteContext,
	) => boolean;

	/**
	 * Called before the new board page is rendered
	 * Return false to prevent rendering (e.g., for authorization)
	 * @param context - Route context
	 */
	onBeforeNewBoardPageRendered?: (context: RouteContext) => boolean;

	// ============ Slot Overrides ============

	/**
	 * Optional slot rendered at the bottom of the task detail dialog.
	 * Use this to inject a comment thread or any custom content without
	 * coupling the kanban plugin to the comments plugin.
	 *
	 * @example
	 * ```tsx
	 * kanban: {
	 *   taskDetailBottomSlot: (task) => (
	 *     <CommentThread
	 *       resourceId={task.id}
	 *       resourceType="kanban-task"
	 *       apiBaseURL={apiBaseURL}
	 *       apiBasePath="/api/data"
	 *       currentUserId={session?.userId}
	 *       loginHref="/login"
	 *     />
	 *   ),
	 * }
	 * ```
	 */
	taskDetailBottomSlot?: (task: SerializedTask) => ReactNode;
}
