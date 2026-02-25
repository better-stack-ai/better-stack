/**
 * Internal query key constants for the Kanban plugin.
 * Shared between query-keys.ts (HTTP path) and prefetchForRoute (DB path)
 * to prevent key drift between SSR loaders and SSG prefetching.
 */

export interface BoardsListDiscriminator {
	slug: string | undefined;
	ownerId: string | undefined;
	organizationId: string | undefined;
	limit: number;
	offset: number;
}

/**
 * Builds the discriminator object for the boards list query key.
 * Mirrors the inline object used in createBoardsQueries.list.
 */
export function boardsListDiscriminator(params?: {
	slug?: string;
	ownerId?: string;
	organizationId?: string;
	limit?: number;
	offset?: number;
}): BoardsListDiscriminator {
	return {
		slug: params?.slug,
		ownerId: params?.ownerId,
		organizationId: params?.organizationId,
		limit: params?.limit ?? 50,
		offset: params?.offset ?? 0,
	};
}

/** Full query key builders — use these with queryClient.setQueryData() */
export const KANBAN_QUERY_KEYS = {
	/**
	 * Key for boards.list(params) query.
	 * Full key: ["boards", "list", { slug, ownerId, organizationId, limit, offset }]
	 */
	boardsList: (params?: {
		slug?: string;
		ownerId?: string;
		organizationId?: string;
		limit?: number;
		offset?: number;
	}) => ["boards", "list", boardsListDiscriminator(params)] as const,

	/**
	 * Key for boards.detail(boardId) query.
	 * Full key: ["boards", "detail", boardId]
	 */
	boardDetail: (boardId: string) => ["boards", "detail", boardId] as const,
};
