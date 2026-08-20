import {
	createApiClient,
	createResourceQueryKeys,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { MediaApiRouter } from "./api/plugin";
import type { AssetListParams } from "./api/getters";
import {
	assetListDiscriminator,
	folderListDiscriminator,
} from "./api/query-key-defs";
import { ROOT_FOLDER_QUERY_VALUE } from "./schemas";
import type { SerializedAsset, SerializedFolder } from "./types";

export interface RegisterAssetInput {
	url: string;
	filename: string;
	mimeType?: string;
	size?: number;
	folderId?: string;
}

export interface CreateMediaFolderInput {
	name: string;
	parentId?: string;
}

function normalizeSearch(query: string | undefined): string | undefined {
	const normalized = query?.trim();
	return normalized || undefined;
}

function paginatedNextPageParam(
	lastPage: { items?: unknown[]; total?: number },
	allPages: { items?: unknown[] }[],
): number | undefined {
	const items = Array.isArray(lastPage.items) ? lastPage.items : [];
	const loadedCount = allPages.reduce(
		(sum, page) => sum + (Array.isArray(page.items) ? page.items.length : 0),
		0,
	);
	return loadedCount < (lastPage.total ?? 0) && items.length > 0
		? loadedCount
		: undefined;
}

/**
 * Media resource declaration — the single source of truth for HTTP mappings,
 * query keys, pagination, and JSON mutations. File uploads stay on the custom
 * upload transport because direct, S3, and Vercel Blob use different flows.
 */
export const mediaResources = {
	mediaAssets: {
		queries: {
			list: {
				path: "/media/assets",
				query: (params: AssetListParams = {}) => ({
					folderId: params.folderId,
					mimeType: params.mimeType,
					query: normalizeSearch(params.query),
					limit: params.limit ?? 20,
				}),
				key: (params: AssetListParams = {}) => [assetListDiscriminator(params)],
				select: (data: any) =>
					data as {
						items: SerializedAsset[];
						total: number;
						limit?: number;
						offset?: number;
					},
				infinite: true,
				pageSize: (params: AssetListParams = {}) => params.limit ?? 20,
				nextPageParam: paginatedNextPageParam,
			},
		},
		mutations: {
			create: {
				path: "@post/media/assets",
				method: "POST" as const,
				input: (input: RegisterAssetInput) => ({
					body: {
						filename: input.filename,
						originalName: input.filename,
						mimeType: input.mimeType ?? "application/octet-stream",
						size: input.size ?? 0,
						url: input.url,
						folderId: input.folderId,
					},
				}),
				select: (data: any) => data as SerializedAsset,
				invalidates: ["mediaAssets.list"],
				refresh: false,
			},
			delete: {
				path: "@delete/media/assets/:id",
				method: "DELETE" as const,
				input: (id: string) => ({ params: { id } }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["mediaAssets.list"],
				refresh: false,
			},
		},
	},

	mediaFolders: {
		queries: {
			list: {
				path: "/media/folders",
				query: (parentId?: string | null) =>
					parentId === undefined
						? {}
						: { parentId: parentId ?? ROOT_FOLDER_QUERY_VALUE },
				key: (parentId?: string | null) => [folderListDiscriminator(parentId)],
				select: (data: any) => data as SerializedFolder[],
			},
		},
		mutations: {
			create: {
				path: "@post/media/folders",
				method: "POST" as const,
				input: (input: CreateMediaFolderInput) => ({ body: input }),
				select: (data: any) => data as SerializedFolder,
				invalidates: ["mediaFolders.list"],
				refresh: false,
			},
			delete: {
				path: "@delete/media/folders/:id",
				method: "DELETE" as const,
				input: (id: string) => ({ params: { id } }),
				select: (data: any) => data as { success: boolean },
				invalidates: ["mediaFolders.list"],
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;

export function createMediaQueryKeys(
	client: ReturnType<typeof createApiClient<MediaApiRouter>>,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, mediaResources, headers);
}

export type MediaQueryKeys = ReturnType<typeof createMediaQueryKeys>;
