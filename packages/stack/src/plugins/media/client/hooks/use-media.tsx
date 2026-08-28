"use client";

import { hashKey, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ResourceFormResult } from "@btst/stack/plugins/client/hooks";
import {
	useIdentity,
	useIdentitySourceGeneration,
	usePluginOverrides,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import type { AssetListParams } from "../../api/getters";
import type { RegisterAssetInput } from "../../query-keys";
import type { SerializedAsset, SerializedFolder } from "../../types";
import type { MediaPluginOverrides } from "../overrides";
import { uploadAsset } from "../upload";
import { media } from "./media-resource";

function useIdentityPartition() {
	const { identity, isPending, error } = useIdentity();
	const sourceGeneration = useIdentitySourceGeneration();
	if (isPending) return `pending:${sourceGeneration}` as const;
	if (error) return `error:${sourceGeneration}` as const;
	return identity ?? undefined;
}

function isUnresolvedIdentityPartition(
	partition: ReturnType<typeof useIdentityPartition>,
) {
	return typeof partition === "string";
}

function sameIdentityPartition(
	queryKey: readonly unknown[],
	partition: ReturnType<typeof useIdentityPartition>,
) {
	const marker = queryKey[3] as { identity?: unknown } | undefined;
	if (partition === undefined) return marker === undefined;
	return (
		marker !== undefined && hashKey([marker.identity]) === hashKey([partition])
	);
}

function useInvalidateCurrentMediaList(
	resource: "mediaAssets" | "mediaFolders",
) {
	const queryClient = useQueryClient();
	const identityPartition = useIdentityPartition();
	return () =>
		queryClient.invalidateQueries({
			queryKey: [resource, "list"],
			predicate: ({ queryKey }) =>
				sameIdentityPartition(queryKey, identityPartition),
			// The current tab can temporarily unmount its list. Refresh only this
			// identity's inactive variants; never refetch a previous account's key
			// with the current request headers.
			refetchType: "all",
		});
}

/** Infinite-scroll list of assets, optionally filtered by folder, MIME type, or search. */
export function useAssets(params: AssetListParams = {}) {
	const identityPartition = useIdentityPartition();
	return media.mediaAssets.list.useInfinite([params, identityPartition], {
		enabled: !isUnresolvedIdentityPartition(identityPartition),
	});
}

/** Pass `null` for root-level folders and `undefined` for all folders. */
export function useFolders(parentId?: string | null) {
	const identityPartition = useIdentityPartition();
	return media.mediaFolders.list.use([parentId, identityPartition], {
		enabled: !isUnresolvedIdentityPartition(identityPartition),
	});
}

/**
 * Upload an asset through the configured direct, S3, or Vercel Blob transport.
 * This remains custom because the resource factory models JSON requests only.
 */
export function useUploadAsset() {
	const {
		headers,
		uploadMode = "direct",
		imageCompression,
	} = usePluginOverrides<MediaPluginOverrides>("media");
	const { api } = useStack();
	// Resource-generated asset queries use the nearest QueryClientProvider.
	// Keep the custom upload transport on that same cache.
	const invalidateCurrentAssets = useInvalidateCurrentMediaList("mediaAssets");

	return useMutation({
		mutationFn: async ({
			file,
			folderId,
		}: {
			file: File;
			folderId?: string;
		}): Promise<SerializedAsset> =>
			uploadAsset(
				{
					apiBaseURL: api?.baseURL ?? "",
					apiBasePath: api?.basePath ?? "",
					headers,
					uploadMode,
					imageCompression,
				},
				{ file, folderId },
			),
		onSuccess: async () => {
			await invalidateCurrentAssets();
		},
	});
}

/** Register an already-hosted asset URL. */
export function useRegisterAsset() {
	return media.mediaAssets.create.use();
}

/** Delete an asset by ID. */
export function useDeleteAsset() {
	return media.mediaAssets.delete.use();
}

/** Create a new folder. */
export function useCreateFolder() {
	return media.mediaFolders.create.use();
}

/** Delete a folder by ID. */
export function useDeleteFolder() {
	return media.mediaFolders.delete.use();
}

export interface RegisterAssetFormValues {
	url: string;
}

export interface UseRegisterAssetFormOptions {
	folderId?: string;
	onSuccess?: (asset: SerializedAsset) => void | Promise<void>;
}

function filenameFromUrl(url: string): string {
	try {
		const filename = new URL(url).pathname.split("/").filter(Boolean).pop();
		return filename ? decodeURIComponent(filename) : "asset";
	} catch {
		return "asset";
	}
}

/** Form lifecycle for registering a hosted asset URL. */
export function useRegisterAssetForm(
	options: UseRegisterAssetFormOptions = {},
): ResourceFormResult<RegisterAssetFormValues, null, SerializedAsset> {
	const t = useTranslate();
	const invalidateCurrentAssets = useInvalidateCurrentMediaList("mediaAssets");
	return media.mediaAssets.useForm<
		RegisterAssetFormValues,
		SerializedAsset,
		null
	>({
		action: "create",
		defaults: { url: "" },
		toCreateVars: (values): RegisterAssetInput => ({
			url: values.url.trim(),
			filename: filenameFromUrl(values.url.trim()),
			folderId: options.folderId,
		}),
		successMessage: t("media.toasts.registerSuccess", "Asset added"),
		errorMessage: (error) =>
			error.message || t("media.toasts.registerError", "Failed to add asset"),
		onSuccess: async (asset) => {
			await invalidateCurrentAssets();
			await options.onSuccess?.(asset);
		},
	});
}

export interface CreateFolderFormValues {
	name: string;
}

export interface UseCreateFolderFormOptions {
	parentId?: string;
	onSuccess?: (folder: SerializedFolder) => void | Promise<void>;
}

/** Form lifecycle for creating a media folder. */
export function useCreateFolderForm(
	options: UseCreateFolderFormOptions = {},
): ResourceFormResult<CreateFolderFormValues, null, SerializedFolder> {
	const t = useTranslate();
	return media.mediaFolders.useForm<
		CreateFolderFormValues,
		SerializedFolder,
		null
	>({
		action: "create",
		defaults: { name: "" },
		toCreateVars: (values) => ({
			name: values.name.trim(),
			parentId: options.parentId,
		}),
		successMessage: t("media.toasts.folderCreateSuccess", "Folder created"),
		errorMessage: (error) =>
			error.message ||
			t("media.toasts.folderCreateError", "Failed to create folder"),
		onSuccess: options.onSuccess,
	});
}
