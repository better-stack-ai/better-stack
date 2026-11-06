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
 * External consumers can provide their own implementations to customize
 * plugin-specific components and behavior.
 */
export interface KanbanPluginOverrides {
	/**
	 * Localization object for the kanban plugin
	 */
	localization?: KanbanLocalization;
	/**
	 * Whether to show the attribution
	 */
	showAttribution?: boolean;
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
	 *     />
	 *   ),
	 * }
	 * ```
	 */
	taskDetailBottomSlot?: (task: SerializedTask) => ReactNode;
}
