"use client";
import {
	useInfiniteQuery,
	useQuery,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query";
import { usePluginOverrides } from "@btst/stack/context";
import { createApiClient } from "@btst/stack/plugins/client";
import type { MediaApiRouter } from "../../api/plugin";
import type { MediaPluginOverrides } from "../overrides";
import { createMediaQueryKeys } from "../../query-keys";
import type { AssetListParams } from "../../api/getters";
import type { SerializedAsset, SerializedFolder } from "../../types";
import { uploadAsset } from "../upload";

function useMediaConfig() {
	return usePluginOverrides<MediaPluginOverrides>("media");
}

function useMediaApiClient() {
	const { apiBaseURL, apiBasePath, headers } = useMediaConfig();
	const client = createApiClient<MediaApiRouter>({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	return { client, headers };
}

/**
 * Infinite-scroll list of assets, optionally filtered by folder / MIME type / search.
 */
export function useAssets(params?: AssetListParams) {
	const { client, headers } = useMediaApiClient();
	const queries = createMediaQueryKeys(client, headers);
	const { queryClient } = useMediaConfig();

	const limit = params?.limit ?? 20;

	return useInfiniteQuery(
		{
			...queries.mediaAssets.list(params),
			initialPageParam: 0,
			refetchOnMount: "always",
			getNextPageParam: (
				lastPage: {
					items: SerializedAsset[];
					total: number;
					limit?: number;
					offset?: number;
				},
				_allPages: any[],
				lastPageParam: number,
			) => {
				const offset = (lastPage.offset ?? 0) + lastPage.items.length;
				return offset < lastPage.total ? offset : undefined;
			},
		},
		queryClient,
	);
}

/**
 * List of folders, optionally filtered by parentId.
 * Pass `null` for root-level folders, `undefined` for all folders.
 */
export function useFolders(parentId?: string | null) {
	const { client, headers } = useMediaApiClient();
	const queries = createMediaQueryKeys(client, headers);
	const { queryClient } = useMediaConfig();

	return useQuery(
		{
			...queries.mediaFolders.list(parentId),
		},
		queryClient,
	);
}

/**
 * Upload an asset — adapter-aware. Handles direct, S3, and Vercel Blob flows.
 */
export function useUploadAsset() {
	const {
		apiBaseURL,
		apiBasePath,
		headers,
		uploadMode = "direct",
		imageCompression,
		queryClient: qc,
	} = useMediaConfig();
	const reactQueryClient = useQueryClient(qc);

	return useMutation(
		{
			mutationFn: async ({
				file,
				folderId,
			}: {
				file: File;
				folderId?: string;
			}): Promise<SerializedAsset> =>
				uploadAsset(
					{
						apiBaseURL,
						apiBasePath,
						headers,
						uploadMode,
						imageCompression,
					},
					{ file, folderId },
				),
			onSuccess: () => {
				reactQueryClient.invalidateQueries({ queryKey: ["mediaAssets"] });
			},
		},
		qc,
	);
}

/**
 * Register an asset URL directly (for when the URL already exists).
 */
export function useRegisterAsset() {
	const {
		apiBaseURL,
		apiBasePath,
		headers,
		queryClient: qc,
	} = useMediaConfig();
	const reactQueryClient = useQueryClient(qc);

	return useMutation(
		{
			mutationFn: async (input: {
				url: string;
				filename: string;
				mimeType?: string;
				size?: number;
				folderId?: string;
			}): Promise<SerializedAsset> => {
				const base = `${apiBaseURL}${apiBasePath}`;
				const headersObj = new Headers(headers as HeadersInit | undefined);
				const res = await fetch(`${base}/media/assets`, {
					method: "POST",
					headers: {
						...Object.fromEntries(headersObj.entries()),
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						filename: input.filename,
						originalName: input.filename,
						mimeType: input.mimeType ?? "application/octet-stream",
						size: input.size ?? 0,
						url: input.url,
						folderId: input.folderId,
					}),
				});
				if (!res.ok) {
					const err = await res
						.json()
						.catch(() => ({ message: res.statusText }));
					throw new Error(err.message ?? "Failed to register asset");
				}
				return res.json();
			},
			onSuccess: () => {
				reactQueryClient.invalidateQueries({ queryKey: ["mediaAssets"] });
			},
		},
		qc,
	);
}

/**
 * Delete an asset by ID.
 */
export function useDeleteAsset() {
	const {
		apiBaseURL,
		apiBasePath,
		headers,
		queryClient: qc,
	} = useMediaConfig();
	const reactQueryClient = useQueryClient(qc);

	return useMutation(
		{
			mutationFn: async (id: string) => {
				const base = `${apiBaseURL}${apiBasePath}`;
				const headersObj = new Headers(headers as HeadersInit | undefined);
				const res = await fetch(`${base}/media/assets/${id}`, {
					method: "DELETE",
					headers: headersObj,
				});
				if (!res.ok) {
					const err = await res
						.json()
						.catch(() => ({ message: res.statusText }));
					throw new Error(err.message ?? "Delete failed");
				}
			},
			onSuccess: () => {
				reactQueryClient.invalidateQueries({ queryKey: ["mediaAssets"] });
			},
		},
		qc,
	);
}

/**
 * Create a new folder.
 */
export function useCreateFolder() {
	const {
		apiBaseURL,
		apiBasePath,
		headers,
		queryClient: qc,
	} = useMediaConfig();
	const reactQueryClient = useQueryClient(qc);

	return useMutation(
		{
			mutationFn: async (input: {
				name: string;
				parentId?: string;
			}): Promise<SerializedFolder> => {
				const base = `${apiBaseURL}${apiBasePath}`;
				const headersObj = new Headers(headers as HeadersInit | undefined);
				const res = await fetch(`${base}/media/folders`, {
					method: "POST",
					headers: {
						...Object.fromEntries(headersObj.entries()),
						"Content-Type": "application/json",
					},
					body: JSON.stringify(input),
				});
				if (!res.ok) {
					const err = await res
						.json()
						.catch(() => ({ message: res.statusText }));
					throw new Error(err.message ?? "Failed to create folder");
				}
				return res.json();
			},
			onSuccess: () => {
				reactQueryClient.invalidateQueries({ queryKey: ["mediaFolders"] });
			},
		},
		qc,
	);
}

/**
 * Delete a folder by ID.
 */
export function useDeleteFolder() {
	const {
		apiBaseURL,
		apiBasePath,
		headers,
		queryClient: qc,
	} = useMediaConfig();
	const reactQueryClient = useQueryClient(qc);

	return useMutation(
		{
			mutationFn: async (id: string) => {
				const base = `${apiBaseURL}${apiBasePath}`;
				const headersObj = new Headers(headers as HeadersInit | undefined);
				const res = await fetch(`${base}/media/folders/${id}`, {
					method: "DELETE",
					headers: headersObj,
				});
				if (!res.ok) {
					const err = await res
						.json()
						.catch(() => ({ message: res.statusText }));
					throw new Error(err.message ?? "Failed to delete folder");
				}
			},
			onSuccess: () => {
				reactQueryClient.invalidateQueries({ queryKey: ["mediaFolders"] });
			},
		},
		qc,
	);
}
