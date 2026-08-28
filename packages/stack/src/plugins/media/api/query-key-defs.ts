/**
 * Internal query key constants for the media plugin.
 * Shared between query-keys.ts (HTTP path) and any SSR/SSG prefetching
 * to prevent key drift between client and server.
 */

import type { AssetListParams } from "./getters";
import type { StackIdentity } from "@btst/stack/context";

/** Identity-aware partition used by protected Media browser and SSR queries. */
export type MediaIdentityPartition =
	| StackIdentity
	| `pending:${number}`
	| `error:${number}`;

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
	assetsList: (
		params?: AssetListParams,
		identityPartition?: MediaIdentityPartition,
	) =>
		identityPartition === undefined
			? (["mediaAssets", "list", assetListDiscriminator(params)] as const)
			: ([
					"mediaAssets",
					"list",
					assetListDiscriminator(params),
					{ identity: identityPartition },
				] as const),

	assetDetail: (id: string) => ["mediaAssets", "detail", id] as const,

	foldersList: (
		parentId?: string | null,
		identityPartition?: MediaIdentityPartition,
	) =>
		identityPartition === undefined
			? (["mediaFolders", "list", folderListDiscriminator(parentId)] as const)
			: ([
					"mediaFolders",
					"list",
					folderListDiscriminator(parentId),
					{ identity: identityPartition },
				] as const),
};
