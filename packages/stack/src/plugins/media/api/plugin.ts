import type { DBAdapter as Adapter } from "@btst/db";
import {
	createEndpoint,
	defineBackendPlugin,
	type OperationData,
} from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { mediaSchema as dbSchema } from "../db";
import {
	AssetListQuerySchema,
	FolderListQuerySchema,
	createAssetSchema,
	createFolderSchema,
	updateAssetSchema,
	uploadTokenRequestSchema,
} from "../schemas";
import {
	getAssetById,
	getFolderById,
	getFolderByName,
	listAssets,
	listFolders,
} from "./getters";
import { createAsset, createFolder, updateAsset } from "./mutations";
import {
	FolderListOperationInputSchema,
	MediaOperationError,
	createMediaOperations,
	type MediaBackendHooks,
	type MediaOperationsConfig,
} from "./operations";
import { MEDIA_QUERY_KEYS } from "./query-key-defs";
import { serializeAsset, serializeFolder } from "./serializers";
import type { StorageAdapter } from "./storage-adapter";

export {
	AssetIdOperationInputSchema,
	DirectUploadOperationInputSchema,
	FolderIdOperationInputSchema,
	FolderListOperationInputSchema,
	UpdateAssetOperationInputSchema,
	VercelBlobOperationInputSchema,
	MediaOperationError,
} from "./operations";
export type {
	MediaApiContext,
	MediaApiResultContext,
	MediaBackendHooks,
	MediaOperationHookContext,
	MediaOperations,
	MediaUploadOperationInput,
	MediaUploadResultOperationInput,
} from "./operations";

/** Configuration for the Media backend plugin. */
export interface MediaBackendConfig {
	/** Storage implementation used for upload initialization, writes, and cleanup. */
	storageAdapter: StorageAdapter;
	/** Maximum accepted upload size. @default 10485760 */
	maxFileSizeBytes?: number;
	/** Optional MIME allowlist, including wildcard forms such as `image/*`. */
	allowedMimeTypes?: string[];
	/** Trusted URL prefixes accepted by asset finalization/registration. */
	allowedUrlPrefixes?: string[];
	/** Post-authorization domain lifecycle hooks. */
	hooks?: MediaBackendHooks;
	/**
	 * Server-only collection scope resolver. Its result is never accepted from a
	 * browser and remains separate from boolean authorization rules.
	 */
	resolveTenantId?: MediaOperationsConfig["resolveTenantId"];
}

/** Raw trusted route key exposed only on `stack.api.media`. */
export type MediaRouteKey = "library";

interface MediaPrefetchForRoute {
	(key: "library", queryClient: QueryClient): Promise<void>;
}

/**
 * Trusted raw SSG prefetch. It bypasses request authorization and is never
 * reachable through HTTP or `forRequest()`. Protect generated output at the
 * deployment boundary when the Media library is not public.
 */
function createMediaPrefetchForRoute(adapter: Adapter): MediaPrefetchForRoute {
	return async (_key, queryClient) => {
		const [assets, folders] = await Promise.all([
			listAssets(adapter, { limit: 40 }),
			listFolders(adapter),
		]);
		queryClient.setQueryData(MEDIA_QUERY_KEYS.assetsList({ limit: 40 }), {
			pages: [
				{
					...assets,
					items: assets.items.map((asset) => {
						const { tenantId: _tenantId, ...safe } = serializeAsset(asset);
						return safe;
					}),
				},
			],
			pageParams: [0],
		});
		queryClient.setQueryData(
			MEDIA_QUERY_KEYS.foldersList(),
			folders.map((folder) => {
				const { tenantId: _tenantId, ...safe } = serializeFolder(folder);
				return safe;
			}),
		);
	};
}

function parseMultipartFile(body: unknown) {
	if (!body || typeof body !== "object") {
		throw new MediaOperationError(
			400,
			"Expected multipart/form-data request body",
			"INVALID_UPLOAD_BODY",
		);
	}
	const record = body as Record<string, unknown>;
	const file = record.file as Record<string, unknown> | undefined;
	if (!file || typeof file.arrayBuffer !== "function") {
		throw new MediaOperationError(
			400,
			"Missing 'file' field in form data",
			"MISSING_UPLOAD_FILE",
		);
	}
	if (typeof file.size !== "number" || file.size < 0) {
		throw new MediaOperationError(
			400,
			"File 'size' is missing or invalid",
			"INVALID_UPLOAD_FILE",
		);
	}
	if (typeof file.name !== "string" || !file.name) {
		throw new MediaOperationError(
			400,
			"File 'name' is missing or invalid",
			"INVALID_UPLOAD_FILE",
		);
	}
	if (typeof file.type !== "string") {
		throw new MediaOperationError(
			400,
			"File 'type' is missing or invalid",
			"INVALID_UPLOAD_FILE",
		);
	}
	return {
		file: file as unknown as Pick<
			File,
			"name" | "type" | "size" | "arrayBuffer"
		>,
		folderId:
			typeof record.folderId === "string" && record.folderId
				? record.folderId
				: undefined,
	};
}

/** Media backend plugin backed by one operation inventory. */
export const mediaBackendPlugin = (config: MediaBackendConfig) =>
	defineBackendPlugin({
		name: "media",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) => createMediaOperations(adapter, config),

		/** Lower-level trusted server API that intentionally bypasses auth and hooks. */
		api: (adapter: Adapter) => ({
			listAssets: (params?: Parameters<typeof listAssets>[1]) =>
				listAssets(adapter, params),
			getAssetById: (id: string) => getAssetById(adapter, id),
			createAsset: (input: Parameters<typeof createAsset>[1]) =>
				createAsset(adapter, input),
			updateAsset: (id: string, input: Parameters<typeof updateAsset>[2]) =>
				updateAsset(adapter, id, input),
			listFolders: (params?: Parameters<typeof listFolders>[1]) =>
				listFolders(adapter, params),
			getFolderById: (id: string) => getFolderById(adapter, id),
			getFolderByName: (
				name: string,
				parentId?: string | null,
				tenantId?: string,
			) => getFolderByName(adapter, name, parentId, tenantId),
			createFolder: (input: Parameters<typeof createFolder>[1]) =>
				createFolder(adapter, input),
			prefetchForRoute: createMediaPrefetchForRoute(adapter),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			// Keep the transport boundary shallow; expanding the generated route
			// handler type exceeds TypeScript's limit for the nested Vercel body union.
			const bindVercelBlobRoute = operations.uploadVercelBlob
				.route as unknown as (
				resolveInput: (ctx: {
					body: unknown;
					request: Request;
					error: (...args: any[]) => Error;
				}) => Promise<{ body: unknown }>,
			) => (ctx: {
				body: unknown;
				request: Request;
				error: (...args: any[]) => Error;
			}) => Promise<OperationData>;
			const listAssetsEndpoint = createEndpoint(
				"/media/assets",
				{ method: "GET", query: AssetListQuerySchema, requireRequest: true },
				operations.listAssets.route((ctx) => ctx.query),
			);
			const createAssetEndpoint = createEndpoint(
				"/media/assets",
				{ method: "POST", body: createAssetSchema, requireRequest: true },
				operations.createAsset.route((ctx) => ctx.body),
			);
			const updateAssetEndpoint = createEndpoint(
				"/media/assets/:id",
				{ method: "PATCH", body: updateAssetSchema, requireRequest: true },
				operations.updateAsset.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			);
			const deleteAssetEndpoint = createEndpoint(
				"/media/assets/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteAsset.route((ctx) => ({ id: ctx.params.id })),
			);
			const listFoldersEndpoint = createEndpoint(
				"/media/folders",
				{ method: "GET", query: FolderListQuerySchema, requireRequest: true },
				operations.listFolders.route((ctx) =>
					FolderListOperationInputSchema.parse(ctx.query),
				),
			);
			const createFolderEndpoint = createEndpoint(
				"/media/folders",
				{ method: "POST", body: createFolderSchema, requireRequest: true },
				operations.createFolder.route((ctx) => ctx.body),
			);
			const deleteFolderEndpoint = createEndpoint(
				"/media/folders/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteFolder.route((ctx) => ({ id: ctx.params.id })),
			);
			const uploadDirectEndpoint = createEndpoint(
				"/media/upload",
				{
					method: "POST",
					requireRequest: true,
					metadata: { allowedMediaTypes: ["multipart/form-data"] },
				},
				operations.uploadDirect.route(async (ctx) => {
					const { file, folderId } = parseMultipartFile(ctx.body);
					const maximumSize = config.maxFileSizeBytes ?? 10 * 1024 * 1024;
					if (file.size > maximumSize) {
						throw new MediaOperationError(
							413,
							`File size ${file.size} bytes exceeds the limit of ${maximumSize} bytes`,
							"FILE_TOO_LARGE",
						);
					}
					return {
						filename: file.name,
						mimeType: file.type,
						size: file.size,
						contentBase64: Buffer.from(await file.arrayBuffer()).toString(
							"base64",
						),
						folderId,
					};
				}),
			);
			const uploadTokenEndpoint = createEndpoint(
				"/media/upload/token",
				{
					method: "POST",
					body: uploadTokenRequestSchema,
					requireRequest: true,
				},
				operations.uploadToken.route((ctx) => ctx.body),
			);
			const uploadVercelBlobEndpoint = createEndpoint(
				"/media/upload/vercel-blob",
				{ method: "POST", requireRequest: true },
				bindVercelBlobRoute(async (ctx) => {
					const body =
						ctx.body ??
						(await ctx.request
							.clone()
							.json()
							.catch(() => ({})));
					return { body };
				}),
			);

			return {
				listAssets: listAssetsEndpoint,
				createAsset: createAssetEndpoint,
				updateAsset: updateAssetEndpoint,
				deleteAsset: deleteAssetEndpoint,
				listFolders: listFoldersEndpoint,
				createFolder: createFolderEndpoint,
				deleteFolder: deleteFolderEndpoint,
				uploadDirect: uploadDirectEndpoint,
				uploadToken: uploadTokenEndpoint,
				uploadVercelBlob: uploadVercelBlobEndpoint,
			} as const;
		},
	});

export type MediaApiRouter = ReturnType<
	ReturnType<typeof mediaBackendPlugin>["routes"]
>;
