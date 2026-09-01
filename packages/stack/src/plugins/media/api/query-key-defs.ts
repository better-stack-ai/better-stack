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

/** Resolved Media service location that partitions shared React Query caches. */
export interface MediaEndpointPartition {
	/** Absolute origin of the resolved Media API. */
	baseURL: string;
	/** Path where the resolved Media API is mounted. */
	basePath: string;
}

/** Stable structured endpoint discriminator used in Media query keys. */
export function mediaEndpointDiscriminator(
	endpoint: MediaEndpointPartition,
): MediaEndpointPartition {
	return {
		baseURL: endpoint.baseURL,
		basePath: endpoint.basePath,
	};
}

/** Identity and endpoint scope shared by Media browser, SSR, and SSG keys. */
export interface MediaQueryScope {
	/** Optional identity partition for protected Media data. */
	identity?: MediaIdentityPartition;
	/** Browser-safe resolved Media service location. */
	endpoint: MediaEndpointPartition;
}

/** Creates the browser-safe scope cell appended to Media list query keys. */
export function mediaQueryScope(
	identityPartition: MediaIdentityPartition | undefined,
	endpoint: MediaEndpointPartition,
): MediaQueryScope {
	return {
		...(identityPartition === undefined ? {} : { identity: identityPartition }),
		endpoint: mediaEndpointDiscriminator(endpoint),
	};
}

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
		params: AssetListParams | undefined,
		identityPartition: MediaIdentityPartition | undefined,
		endpoint: MediaEndpointPartition,
	) =>
		[
			"mediaAssets",
			"list",
			assetListDiscriminator(params),
			mediaQueryScope(identityPartition, endpoint),
		] as const,

	assetDetail: (id: string) => ["mediaAssets", "detail", id] as const,

	foldersList: (
		parentId: string | null | undefined,
		identityPartition: MediaIdentityPartition | undefined,
		endpoint: MediaEndpointPartition,
	) =>
		[
			"mediaFolders",
			"list",
			folderListDiscriminator(parentId),
			mediaQueryScope(identityPartition, endpoint),
		] as const,
};
