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
	limit: number | undefined;
	offset: number | undefined;
}

export function assetListDiscriminator(
	params?: AssetListParams,
): AssetListDiscriminator {
	return {
		folderId: params?.folderId,
		mimeType: params?.mimeType,
		query: params?.query?.trim() || undefined,
		limit: params?.limit,
		offset: params?.offset,
	};
}

export type FolderListDiscriminator = "all" | "root" | string;

export function folderListDiscriminator(
	parentId?: string | null,
): FolderListDiscriminator {
	if (parentId === undefined) return "all";
	return parentId === null ? "root" : parentId;
}

/** Full query key builders — use these with `queryClient.setQueryData()`. */
export const MEDIA_QUERY_KEYS = {
	assetsList: (params?: AssetListParams) =>
		["mediaAssets", "list", assetListDiscriminator(params)] as const,

	assetDetail: (id: string) => ["mediaAssets", "detail", id] as const,

	foldersList: (parentId?: string | null) =>
		["mediaFolders", "list", folderListDiscriminator(parentId)] as const,
};
