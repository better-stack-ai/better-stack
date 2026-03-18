/**
 * Internal query key constants for the media plugin.
 * Shared between query-keys.ts (HTTP path) and any SSR/SSG prefetching
 * to prevent key drift between client and server.
 */

import type { AssetListParams } from "./getters";

/**
 * Discriminator for the asset list cache key.
 */
export interface AssetListDiscriminator {
	folderId: string | undefined;
	mimeType: string | undefined;
	query: string | undefined;
	limit: number;
	offset: number;
}

export function assetListDiscriminator(
	params?: AssetListParams,
): AssetListDiscriminator {
	return {
		folderId: params?.folderId,
		mimeType: params?.mimeType,
		query: params?.query,
		limit: params?.limit ?? 20,
		offset: params?.offset ?? 0,
	};
}

/** Full query key builders — use these with `queryClient.setQueryData()`. */
export const MEDIA_QUERY_KEYS = {
	assetsList: (params?: AssetListParams) =>
		["media", "assets", "list", assetListDiscriminator(params)] as const,

	assetDetail: (id: string) => ["media", "assets", "detail", id] as const,

	foldersList: (parentId?: string | null) =>
		["media", "folders", "list", parentId ?? "root"] as const,
};
