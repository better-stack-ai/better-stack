"use client";

import {
	hashKey,
	useMutation,
	useQueryClient,
	type UseMutationResult,
} from "@tanstack/react-query";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { ResourceFormResult } from "@btst/stack/plugins/client/hooks";
import {
	useIdentity,
	useIdentitySourceGeneration,
	usePluginOverrides,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import type { AssetListParams } from "../../api/getters";
import type {
	MediaEndpointPartition,
	MediaQueryScope,
} from "../../api/query-key-defs";
import type { RegisterAssetInput } from "../../query-keys";
import type { SerializedAsset, SerializedFolder } from "../../types";
import { MEDIA_PLUGIN_ID } from "../constants";
import type { MediaPluginOverrides, MediaProviderConfig } from "../overrides";
import { createMediaUploadConfig, uploadAsset } from "../upload";
import { resolveMediaAsset } from "../../asset-url";
import { media } from "./media-resource";

function useMediaEndpointPartition(): MediaEndpointPartition {
	const { api, plugins } = useStack();
	const pluginApi = plugins?.[MEDIA_PLUGIN_ID]?.api;
	const baseURL = pluginApi?.baseURL ?? api?.baseURL ?? "";
	const basePath = pluginApi?.basePath ?? api?.basePath ?? "";
	return useMemo(() => ({ baseURL, basePath }), [baseURL, basePath]);
}

function useMediaApiBaseURL() {
	return useMediaEndpointPartition().baseURL;
}

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
	const scope = queryKey[3] as MediaQueryScope | undefined;
	const hasIdentity = scope !== undefined && Object.hasOwn(scope, "identity");
	if (partition === undefined) return !hasIdentity;
	return hasIdentity && hashKey([scope.identity]) === hashKey([partition]);
}

function sameEndpointPartition(
	queryKey: readonly unknown[],
	partition: MediaEndpointPartition,
) {
	const scope = queryKey[3] as MediaQueryScope | undefined;
	return hashKey([scope?.endpoint]) === hashKey([partition]);
}

function samePartition(
	left: ReturnType<typeof useIdentityPartition>,
	right: ReturnType<typeof useIdentityPartition>,
) {
	return hashKey([left]) === hashKey([right]);
}

interface CurrentMediaListScope {
	identity: ReturnType<typeof useIdentityPartition>;
	endpoint: MediaEndpointPartition;
}

function sameListScope(
	left: CurrentMediaListScope,
	right: CurrentMediaListScope,
) {
	return (
		samePartition(left.identity, right.identity) &&
		hashKey([left.endpoint]) === hashKey([right.endpoint])
	);
}

function useCurrentMediaListRefresh(resource: "mediaAssets" | "mediaFolders") {
	const { queryClient: stackQueryClient } = useStack();
	const queryClient = useQueryClient(stackQueryClient);
	const endpointPartition = useMediaEndpointPartition();
	const identityPartition = useIdentityPartition();
	const currentScope = useMemo<CurrentMediaListScope>(
		() => ({ identity: identityPartition, endpoint: endpointPartition }),
		[identityPartition, endpointPartition],
	);
	const latestScope = useRef(currentScope);
	const mounted = useRef(true);
	useLayoutEffect(() => {
		latestScope.current = currentScope;
	}, [currentScope]);
	useLayoutEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const removeScope = (scope: CurrentMediaListScope) =>
		queryClient.removeQueries({
			queryKey: [resource, "list"],
			predicate: ({ queryKey }) =>
				sameIdentityPartition(queryKey, scope.identity) &&
				sameEndpointPartition(queryKey, scope.endpoint),
		});
	const refreshAfterSuccess = async (startedAs: CurrentMediaListScope) => {
		const current = latestScope.current;
		if (!mounted.current || !sameListScope(startedAs, current)) {
			// Never refetch an initiating account with a newer account's session.
			// The endpoint is part of that ownership boundary for shared caches.
			removeScope(startedAs);
			return;
		}
		await queryClient.invalidateQueries({
			queryKey: [resource, "list"],
			predicate: ({ queryKey }) =>
				sameIdentityPartition(queryKey, current.identity) &&
				sameEndpointPartition(queryKey, current.endpoint),
			// The current tab can temporarily unmount its list. Refresh only this
			// identity's inactive variants; never refetch a previous account's key
			// with the current request headers.
			refetchType: "all",
		});
	};

	return {
		// Event handlers retain the hook result from the committed render. Reading
		// that closure prevents an abandoned concurrent render from changing which
		// identity and endpoint own a newly-started mutation.
		currentScope: () => currentScope,
		refreshAfterSuccess,
	};
}

function withCurrentListRefresh<TData, TVariables>(
	mutation: UseMutationResult<TData, Error, TVariables>,
	listRefresh: ReturnType<typeof useCurrentMediaListRefresh>,
	mapResult: (data: TData) => TData = (data) => data,
	data: TData | undefined = mutation.data,
): UseMutationResult<TData, Error, TVariables> {
	const mutateAsync: typeof mutation.mutateAsync = async (
		variables,
		options,
	) => {
		const startedAs = listRefresh.currentScope();
		const result = await mutation.mutateAsync(variables, {
			...options,
			onSuccess: options?.onSuccess
				? (data, ...args) => options.onSuccess?.(mapResult(data), ...args)
				: undefined,
			onSettled: options?.onSettled
				? (data, ...args) =>
						options.onSettled?.(
							data === undefined ? undefined : mapResult(data),
							...args,
						)
				: undefined,
		});
		await listRefresh.refreshAfterSuccess(startedAs);
		return mapResult(result);
	};
	const mutate: typeof mutation.mutate = (variables, options) => {
		// Each invocation owns an awaited promise, so a later mutation cannot
		// detach the successful call's required cache refresh.
		void mutateAsync(variables, options).catch(() => {});
	};
	return {
		...mutation,
		data,
		mutate,
		mutateAsync,
	} as UseMutationResult<TData, Error, TVariables>;
}

/** Infinite-scroll list of assets, optionally filtered by folder, MIME type, or search. */
export function useAssets(params: AssetListParams = {}) {
	const identityPartition = useIdentityPartition();
	const endpointPartition = useMediaEndpointPartition();
	const result = media.mediaAssets.list.useInfinite(
		[params, identityPartition, endpointPartition],
		{
			enabled: !isUnresolvedIdentityPartition(identityPartition),
		},
	);
	return result;
}

/** Pass `null` for root-level folders and `undefined` for all folders. */
export function useFolders(parentId?: string | null) {
	const identityPartition = useIdentityPartition();
	const endpointPartition = useMediaEndpointPartition();
	return media.mediaFolders.list.use(
		[parentId, identityPartition, endpointPartition],
		{
			enabled: !isUnresolvedIdentityPartition(identityPartition),
		},
	);
}

/**
 * Upload an asset through the configured direct, S3, or Vercel Blob transport.
 * This remains custom because the resource factory models JSON requests only.
 */
export function useUploadAsset() {
	const { imageCompression } =
		usePluginOverrides<MediaPluginOverrides>(MEDIA_PLUGIN_ID);
	const { api, plugins, queryClient: stackQueryClient } = useStack();
	const queryClient = useQueryClient(stackQueryClient);
	const pluginRuntime = plugins?.[MEDIA_PLUGIN_ID];
	const pluginApi = pluginRuntime?.api ?? api;
	const providerConfig = pluginRuntime?.config as
		| MediaProviderConfig
		| undefined;
	// Resource-generated asset queries use the stack-owned QueryClient.
	// Keep the custom upload transport on that same cache.
	const listRefresh = useCurrentMediaListRefresh("mediaAssets");

	return useMutation(
		{
			onMutate: () => listRefresh.currentScope(),
			mutationFn: async ({
				file,
				folderId,
			}: {
				file: File;
				folderId?: string;
			}): Promise<SerializedAsset> =>
				uploadAsset(
					createMediaUploadConfig(
						{
							api: {
								baseURL: pluginApi?.baseURL ?? "",
								basePath: pluginApi?.basePath ?? "",
								browserHeaders: pluginRuntime?.api.browserHeaders,
								credentials: pluginRuntime?.api.credentials,
							},
							config: providerConfig,
						},
						{ imageCompression },
					),
					{ file, folderId },
				),
			onSuccess: async (_asset, _variables, startedAs) => {
				await listRefresh.refreshAfterSuccess(startedAs);
			},
		},
		queryClient,
	);
}

/** Register an already-hosted asset URL. */
export function useRegisterAsset() {
	const mutation = media.mediaAssets.create.use();
	const listRefresh = useCurrentMediaListRefresh("mediaAssets");
	const apiBaseURL = useMediaApiBaseURL();
	const data = useMemo(
		() =>
			mutation.data === undefined
				? undefined
				: resolveMediaAsset(mutation.data, apiBaseURL),
		[mutation.data, apiBaseURL],
	);
	return withCurrentListRefresh(
		mutation,
		listRefresh,
		(asset) => resolveMediaAsset(asset, apiBaseURL),
		data,
	);
}

/** Delete an asset by ID. */
export function useDeleteAsset() {
	const mutation = media.mediaAssets.delete.use();
	const listRefresh = useCurrentMediaListRefresh("mediaAssets");
	return withCurrentListRefresh(mutation, listRefresh);
}

/** Create a new folder. */
export function useCreateFolder() {
	const mutation = media.mediaFolders.create.use();
	const listRefresh = useCurrentMediaListRefresh("mediaFolders");
	return withCurrentListRefresh(mutation, listRefresh);
}

/** Delete a folder by ID. */
export function useDeleteFolder() {
	const mutation = media.mediaFolders.delete.use();
	const listRefresh = useCurrentMediaListRefresh("mediaFolders");
	return withCurrentListRefresh(mutation, listRefresh);
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
	const apiBaseURL = useMediaApiBaseURL();
	const listRefresh = useCurrentMediaListRefresh("mediaAssets");
	const form = media.mediaAssets.useForm<
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
	});
	return {
		...form,
		submit: async (values) => {
			const startedAs = listRefresh.currentScope();
			const submittedAsset = await form.submit(values);
			if (submittedAsset === undefined) return undefined;
			const asset = resolveMediaAsset(submittedAsset, apiBaseURL);
			await listRefresh.refreshAfterSuccess(startedAs);
			await options.onSuccess?.(asset);
			return asset;
		},
	};
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
	const listRefresh = useCurrentMediaListRefresh("mediaFolders");
	const form = media.mediaFolders.useForm<
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
	});
	return {
		...form,
		submit: async (values) => {
			const startedAs = listRefresh.currentScope();
			const folder = await form.submit(values);
			if (folder === undefined) return undefined;
			await listRefresh.refreshAfterSuccess(startedAs);
			await options.onSuccess?.(folder);
			return folder;
		},
	};
}
