import type { DBAdapter as Adapter } from "@btst/db";
import { defineBackendPlugin, createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import { mediaSchema as dbSchema } from "../db";
import type { Asset } from "../types";
import {
	AssetListQuerySchema,
	createAssetSchema,
	updateAssetSchema,
	createFolderSchema,
	uploadTokenRequestSchema,
} from "../schemas";
import {
	listAssets,
	getAssetById,
	listFolders,
	getFolderById,
} from "./getters";
import {
	createAsset,
	updateAsset,
	deleteAsset,
	createFolder,
	deleteFolder,
} from "./mutations";
import {
	isDirectAdapter,
	isS3Adapter,
	isVercelBlobAdapter,
	type StorageAdapter,
} from "./storage-adapter";
import { runHookWithShim } from "../../utils";

/**
 * Context passed to media API hooks.
 */
export interface MediaApiContext<
	TBody = unknown,
	TParams = unknown,
	TQuery = unknown,
> {
	body?: TBody;
	params?: TParams;
	query?: TQuery;
	request?: Request;
	headers?: Headers;
	[key: string]: unknown;
}

/**
 * Configuration hooks for the media backend plugin.
 * All hooks are optional and allow consumers to customise behaviour.
 */
export interface MediaBackendHooks {
	/**
	 * Called before a file upload is allowed (both direct and signed adapters).
	 * Throw an Error to reject the upload (e.g. if the user is not authenticated).
	 */
	onBeforeUpload?: (
		meta: { filename: string; mimeType: string; size?: number },
		context: MediaApiContext,
	) => Promise<void> | void;

	/**
	 * Called after an asset record is created in the database.
	 */
	onAfterUpload?: (
		asset: Asset,
		context: MediaApiContext,
	) => Promise<void> | void;

	/**
	 * Called before an asset is deleted. Throw to prevent deletion.
	 */
	onBeforeDelete?: (
		asset: Asset,
		context: MediaApiContext,
	) => Promise<void> | void;

	/**
	 * Called after an asset has been deleted from the DB and storage.
	 */
	onAfterDelete?: (
		assetId: string,
		context: MediaApiContext,
	) => Promise<void> | void;

	/**
	 * Called before listing assets. Throw to deny access.
	 */
	onBeforeListAssets?: (
		filter: z.infer<typeof AssetListQuerySchema>,
		context: MediaApiContext,
	) => Promise<void> | void;
}

/**
 * Configuration for the media backend plugin.
 */
export interface MediaBackendConfig {
	/**
	 * The storage adapter to use for file uploads.
	 * - `localAdapter()` — writes to the local filesystem (dev / self-hosted)
	 * - `s3Adapter()` — presigned PUT URL (AWS S3, Cloudflare R2, MinIO)
	 * - `vercelBlobAdapter()` — signed direct upload via Vercel Blob
	 */
	storageAdapter: StorageAdapter;

	/**
	 * Maximum file size in bytes.
	 * Enforced server-side for `localAdapter`.
	 * Passed into the Vercel Blob token for edge enforcement.
	 * Validated against the client-reported size for `s3Adapter`.
	 * @default 10485760 (10 MB)
	 */
	maxFileSizeBytes?: number;

	/**
	 * MIME type allowlist (e.g. `["image/jpeg", "image/png"]`).
	 * If omitted, all MIME types are accepted.
	 * Enforced server-side for `localAdapter`.
	 * Passed to Vercel Blob token for edge enforcement.
	 * Validated against the client-reported MIME type for `s3Adapter`.
	 */
	allowedMimeTypes?: string[];

	/**
	 * Optional lifecycle hooks for the media backend plugin.
	 */
	hooks?: MediaBackendHooks;
}

/**
 * Media backend plugin.
 * Provides API endpoints for managing media assets and folders, and supports
 * local, S3-compatible, and Vercel Blob storage backends.
 *
 * @example
 * ```ts
 * import { mediaBackendPlugin, localAdapter } from "@btst/stack/plugins/media/api";
 *
 * mediaBackendPlugin({
 *   storageAdapter: localAdapter(),
 *   hooks: {
 *     onBeforeUpload: async (_meta, ctx) => {
 *       const session = await getSession(ctx.headers as Headers);
 *       if (!session) throw new Error("Unauthorized");
 *     },
 *   },
 * })
 * ```
 */
export const mediaBackendPlugin = (config: MediaBackendConfig) =>
	defineBackendPlugin({
		name: "media",

		dbPlugin: dbSchema,

		api: (adapter: Adapter) => ({
			listAssets: (params?: Parameters<typeof listAssets>[1]) =>
				listAssets(adapter, params),
			getAssetById: (id: string) => getAssetById(adapter, id),
			listFolders: (params?: Parameters<typeof listFolders>[1]) =>
				listFolders(adapter, params),
		}),

		routes: (adapter: Adapter) => {
			const {
				storageAdapter,
				maxFileSizeBytes = 10 * 1024 * 1024,
				allowedMimeTypes,
				hooks,
			} = config;

			function validateMimeType(mimeType: string, ctx: { error: Function }) {
				if (allowedMimeTypes && allowedMimeTypes.length > 0) {
					const allowed = allowedMimeTypes.some((pattern) => {
						if (pattern.endsWith("/*")) {
							return mimeType.startsWith(pattern.slice(0, -1));
						}
						return mimeType === pattern;
					});
					if (!allowed) {
						throw ctx.error(415, {
							message: `MIME type '${mimeType}' is not allowed. Allowed: ${allowedMimeTypes.join(", ")}`,
						});
					}
				}
			}

			// ── Asset endpoints ────────────────────────────────────────────────────

			const listAssetsEndpoint = createEndpoint(
				"/media/assets",
				{
					method: "GET",
					query: AssetListQuerySchema,
				},
				async (ctx) => {
					const { query, headers } = ctx;
					const context: MediaApiContext = { query, headers };

					if (hooks?.onBeforeListAssets) {
						await runHookWithShim(
							() => hooks.onBeforeListAssets!(query, context),
							ctx.error,
							"Unauthorized: Cannot list assets",
						);
					}

					return listAssets(adapter, query);
				},
			);

			const createAssetEndpoint = createEndpoint(
				"/media/assets",
				{
					method: "POST",
					body: createAssetSchema,
				},
				async (ctx) => {
					const context: MediaApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					if (hooks?.onBeforeUpload) {
						await runHookWithShim(
							() =>
								hooks.onBeforeUpload!(
									{
										filename: ctx.body.filename,
										mimeType: ctx.body.mimeType,
										size: ctx.body.size,
									},
									context,
								),
							ctx.error,
							"Unauthorized: Cannot upload asset",
						);
					}

					validateMimeType(ctx.body.mimeType, ctx);

					if (ctx.body.size > maxFileSizeBytes) {
						throw ctx.error(413, {
							message: `File size ${ctx.body.size} bytes exceeds the limit of ${maxFileSizeBytes} bytes`,
						});
					}

					const asset = await createAsset(adapter, ctx.body);

					if (hooks?.onAfterUpload) {
						await hooks.onAfterUpload(asset, context);
					}

					return asset;
				},
			);

			const updateAssetEndpoint = createEndpoint(
				"/media/assets/:id",
				{
					method: "PATCH",
					body: updateAssetSchema,
				},
				async (ctx) => {
					const existing = await getAssetById(adapter, ctx.params.id);
					if (!existing) {
						throw ctx.error(404, { message: "Asset not found" });
					}

					const updated = await updateAsset(adapter, ctx.params.id, ctx.body);
					if (!updated) {
						throw ctx.error(404, { message: "Asset not found" });
					}

					return updated;
				},
			);

			const deleteAssetEndpoint = createEndpoint(
				"/media/assets/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					const context: MediaApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					const asset = await getAssetById(adapter, ctx.params.id);
					if (!asset) {
						throw ctx.error(404, { message: "Asset not found" });
					}

					if (hooks?.onBeforeDelete) {
						await runHookWithShim(
							() => hooks.onBeforeDelete!(asset, context),
							ctx.error,
							"Unauthorized: Cannot delete asset",
						);
					}

					await deleteAsset(adapter, ctx.params.id);

					try {
						await storageAdapter.delete(asset.url);
					} catch (err) {
						console.error(
							`[btst/media] Failed to delete file from storage: ${asset.url}`,
							err,
						);
					}

					if (hooks?.onAfterDelete) {
						await hooks.onAfterDelete(ctx.params.id, context);
					}

					return { success: true };
				},
			);

			// ── Folder endpoints ────────────────────────────────────────────────────

			const listFoldersEndpoint = createEndpoint(
				"/media/folders",
				{
					method: "GET",
					query: z.object({
						parentId: z.string().optional(),
					}),
				},
				async (ctx) => {
					return listFolders(adapter, { parentId: ctx.query.parentId });
				},
			);

			const createFolderEndpoint = createEndpoint(
				"/media/folders",
				{
					method: "POST",
					body: createFolderSchema,
				},
				async (ctx) => {
					return createFolder(adapter, ctx.body);
				},
			);

			const deleteFolderEndpoint = createEndpoint(
				"/media/folders/:id",
				{
					method: "DELETE",
				},
				async (ctx) => {
					const folder = await getFolderById(adapter, ctx.params.id);
					if (!folder) {
						throw ctx.error(404, { message: "Folder not found" });
					}

					try {
						await deleteFolder(adapter, ctx.params.id);
					} catch (err) {
						throw ctx.error(409, {
							message:
								err instanceof Error ? err.message : "Cannot delete folder",
						});
					}

					return { success: true };
				},
			);

			// ── Upload endpoints (adapter-specific) ────────────────────────────────

			// Direct upload — local adapter only
			const uploadDirectEndpoint = createEndpoint(
				"/media/upload",
				{
					method: "POST",
				},
				async (ctx) => {
					if (!isDirectAdapter(storageAdapter)) {
						throw ctx.error(400, {
							message:
								"Direct upload is only supported with the local storage adapter",
						});
					}

					if (!ctx.request) {
						throw ctx.error(400, {
							message: "Request object is not available",
						});
					}

					const formData = await ctx.request.formData();
					const file = formData.get("file");

					if (!file || !(file instanceof File)) {
						throw ctx.error(400, {
							message: "Missing 'file' field in form data",
						});
					}

					const context: MediaApiContext = { headers: ctx.headers };

					if (hooks?.onBeforeUpload) {
						await runHookWithShim(
							() =>
								hooks.onBeforeUpload!(
									{
										filename: file.name,
										mimeType: file.type,
										size: file.size,
									},
									context,
								),
							ctx.error,
							"Unauthorized: Cannot upload asset",
						);
					}

					validateMimeType(file.type, ctx);

					if (file.size > maxFileSizeBytes) {
						throw ctx.error(413, {
							message: `File size ${file.size} bytes exceeds the limit of ${maxFileSizeBytes} bytes`,
						});
					}

					const buffer = Buffer.from(await file.arrayBuffer());
					const { url } = await storageAdapter.upload(buffer, {
						filename: file.name,
						mimeType: file.type,
						size: file.size,
						folderId:
							(formData.get("folderId") as string | undefined) ?? undefined,
					});

					const asset = await createAsset(adapter, {
						filename: url.split("/").pop() ?? file.name,
						originalName: file.name,
						mimeType: file.type,
						size: file.size,
						url,
						folderId:
							(formData.get("folderId") as string | undefined) ?? undefined,
					});

					if (hooks?.onAfterUpload) {
						await hooks.onAfterUpload(asset, context);
					}

					return asset;
				},
			);

			// Token generation — S3 adapter
			const uploadTokenEndpoint = createEndpoint(
				"/media/upload/token",
				{
					method: "POST",
					body: uploadTokenRequestSchema,
				},
				async (ctx) => {
					if (!isS3Adapter(storageAdapter)) {
						throw ctx.error(400, {
							message:
								"Upload token endpoint is only supported with the S3 storage adapter",
						});
					}

					const context: MediaApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					if (hooks?.onBeforeUpload) {
						await runHookWithShim(
							() =>
								hooks.onBeforeUpload!(
									{
										filename: ctx.body.filename,
										mimeType: ctx.body.mimeType,
										size: ctx.body.size,
									},
									context,
								),
							ctx.error,
							"Unauthorized: Cannot upload asset",
						);
					}

					validateMimeType(ctx.body.mimeType, ctx);

					if (ctx.body.size > maxFileSizeBytes) {
						throw ctx.error(413, {
							message: `File size ${ctx.body.size} bytes exceeds the limit of ${maxFileSizeBytes} bytes`,
						});
					}

					return storageAdapter.generateUploadToken({
						filename: ctx.body.filename,
						mimeType: ctx.body.mimeType,
						size: ctx.body.size,
						folderId: ctx.body.folderId,
					});
				},
			);

			// Vercel Blob token exchange — vercel-blob adapter
			const uploadVercelBlobEndpoint = createEndpoint(
				"/media/upload/vercel-blob",
				{
					method: "POST",
				},
				async (ctx) => {
					if (!isVercelBlobAdapter(storageAdapter)) {
						throw ctx.error(400, {
							message:
								"Vercel Blob endpoint is only supported with the vercelBlobAdapter",
						});
					}

					const context: MediaApiContext = { headers: ctx.headers };

					if (!ctx.request) {
						throw ctx.error(400, {
							message: "Request object is not available",
						});
					}

					return storageAdapter.handleRequest(ctx.request, {
						onBeforeGenerateToken: async (pathname, clientPayload) => {
							if (hooks?.onBeforeUpload) {
								const filename = pathname.split("/").pop() ?? pathname;
								await runHookWithShim(
									() =>
										hooks.onBeforeUpload!(
											{
												filename,
												mimeType:
													(clientPayload ? JSON.parse(clientPayload) : {})
														?.mimeType ?? "application/octet-stream",
											},
											context,
										),
									ctx.error,
									"Unauthorized: Cannot upload asset",
								);
							}
						},
					});
				},
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
