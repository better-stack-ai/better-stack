import type { DBAdapter as Adapter } from "@btst/db";
import { defineBackendPlugin, createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import { mediaSchema as dbSchema } from "../db";
import type { Asset, Folder } from "../types";
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
 * Sanitize a string for use in an S3 object key.
 * Strips path separators and parent-directory segments to prevent path traversal.
 */
function sanitizeS3KeySegment(s: string): string {
	return s.replace(/[/\\]/g, "-").replace(/\.\./g, "_").trim() || "unknown";
}

function matchesUrlPrefix(url: string, prefix: string): boolean {
	const normalizedPrefix = `${prefix.replace(/\/+$/, "")}/`;
	return url.startsWith(normalizedPrefix);
}

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

	/**
	 * Called before updating an asset (PATCH). Throw to deny access.
	 */
	onBeforeUpdateAsset?: (
		asset: Asset,
		updates: z.infer<typeof updateAssetSchema>,
		context: MediaApiContext,
	) => Promise<void> | void;

	/**
	 * Called before listing folders. Throw to deny access.
	 */
	onBeforeListFolders?: (
		filter: { parentId?: string },
		context: MediaApiContext,
	) => Promise<void> | void;

	/**
	 * Called before creating a folder. Throw to deny access.
	 */
	onBeforeCreateFolder?: (
		input: z.infer<typeof createFolderSchema>,
		context: MediaApiContext,
	) => Promise<void> | void;

	/**
	 * Called before deleting a folder. Throw to deny access.
	 */
	onBeforeDeleteFolder?: (
		folder: Folder,
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
	 * URL prefixes that are allowed when creating asset records via `POST /media/assets`.
	 * When omitted the plugin automatically derives a safe default from the storage adapter:
	 * - `s3Adapter` → the configured `publicBaseUrl`
	 * - `vercelBlobAdapter` → any URL whose hostname ends with `.public.blob.vercel-storage.com`
	 * - `localAdapter` → rejects client-supplied URLs; use `POST /media/upload` instead
	 *
	 * Provide this option only when you need to override the automatic default (e.g. to allow
	 * assets from a CDN in front of your storage that uses a different domain). When using
	 * `localAdapter`, setting `allowedUrlPrefixes` explicitly opts `POST /media/assets` back in.
	 */
	allowedUrlPrefixes?: string[];

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
			getFolderById: (id: string) => getFolderById(adapter, id),
		}),

		routes: (adapter: Adapter) => {
			const {
				storageAdapter,
				maxFileSizeBytes = 10 * 1024 * 1024,
				allowedMimeTypes,
				allowedUrlPrefixes,
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

					{
						const url = ctx.body.url;
						let urlAllowed = true;
						let denialReason = "";

						if (allowedUrlPrefixes && allowedUrlPrefixes.length > 0) {
							// Consumer-supplied override — validate against explicit list.
							urlAllowed = allowedUrlPrefixes.some((p) =>
								matchesUrlPrefix(url, p),
							);
							denialReason = `URL must start with one of: ${allowedUrlPrefixes.join(", ")}`;
						} else if (isDirectAdapter(storageAdapter)) {
							// localAdapter writes files server-side via POST /media/upload and returns
							// relative URLs. Reject client-supplied asset URLs unless the consumer
							// explicitly opts into trusted prefixes via allowedUrlPrefixes.
							urlAllowed = false;
							denialReason =
								"Client-supplied asset URLs are not allowed with localAdapter. Use POST /media/upload instead, or configure allowedUrlPrefixes to explicitly allow trusted URL prefixes.";
						} else if (isS3Adapter(storageAdapter)) {
							// Auto-derived from s3Adapter's publicBaseUrl.
							urlAllowed = matchesUrlPrefix(url, storageAdapter.urlPrefix);
							denialReason = `URL must start with the configured S3 publicBaseUrl: ${storageAdapter.urlPrefix}`;
						} else if (isVercelBlobAdapter(storageAdapter)) {
							// Vercel Blob public URLs always belong to a known CDN hostname suffix.
							try {
								const hostname = new URL(url).hostname;
								urlAllowed = hostname.endsWith(
									storageAdapter.urlHostnameSuffix,
								);
							} catch {
								urlAllowed = false;
							}
							denialReason = `URL hostname must end with ${storageAdapter.urlHostnameSuffix}`;
						}

						if (!urlAllowed) {
							throw ctx.error(400, { message: denialReason });
						}
					}

					if (ctx.body.folderId) {
						const folder = await getFolderById(adapter, ctx.body.folderId);
						if (!folder) {
							throw ctx.error(404, { message: "Folder not found" });
						}
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

					const context: MediaApiContext = {
						body: ctx.body,
						params: ctx.params,
						headers: ctx.headers,
					};

					if (hooks?.onBeforeUpdateAsset) {
						await runHookWithShim(
							() => hooks.onBeforeUpdateAsset!(existing, ctx.body, context),
							ctx.error,
							"Unauthorized: Cannot update asset",
						);
					}

					if (ctx.body.folderId != null) {
						const folder = await getFolderById(adapter, ctx.body.folderId);
						if (!folder) {
							throw ctx.error(404, { message: "Folder not found" });
						}
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

					// Delete the storage file FIRST — if this fails the DB record is
					// still intact and the deletion can be retried. Removing the DB
					// record first would silently orphan the file in storage with no
					// way to track or clean it up.
					try {
						await storageAdapter.delete(asset.url);
					} catch (err) {
						console.error(
							`[btst/media] Failed to delete file from storage: ${asset.url}`,
							err,
						);
						throw ctx.error(500, {
							message: "Failed to delete file from storage",
						});
					}

					await deleteAsset(adapter, ctx.params.id);

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
					const filter = { parentId: ctx.query.parentId };
					const context: MediaApiContext = {
						query: ctx.query,
						headers: ctx.headers,
					};

					if (hooks?.onBeforeListFolders) {
						await runHookWithShim(
							() => hooks.onBeforeListFolders!(filter, context),
							ctx.error,
							"Unauthorized: Cannot list folders",
						);
					}

					return listFolders(adapter, filter);
				},
			);

			const createFolderEndpoint = createEndpoint(
				"/media/folders",
				{
					method: "POST",
					body: createFolderSchema,
				},
				async (ctx) => {
					const context: MediaApiContext = {
						body: ctx.body,
						headers: ctx.headers,
					};

					if (hooks?.onBeforeCreateFolder) {
						await runHookWithShim(
							() => hooks.onBeforeCreateFolder!(ctx.body, context),
							ctx.error,
							"Unauthorized: Cannot create folder",
						);
					}

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

					const context: MediaApiContext = {
						params: ctx.params,
						headers: ctx.headers,
					};

					if (hooks?.onBeforeDeleteFolder) {
						await runHookWithShim(
							() => hooks.onBeforeDeleteFolder!(folder, context),
							ctx.error,
							"Unauthorized: Cannot delete folder",
						);
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
					metadata: {
						// Tell Better Call this endpoint accepts multipart/form-data so it
						// parses the body into a FormData object and exposes it as ctx.body.
						// Without this, Better Call may pre-read the body stream and calling
						// ctx.request.formData() afterwards fails with "Body already read".
						allowedMediaTypes: ["multipart/form-data"],
					},
				},
				async (ctx) => {
					if (!isDirectAdapter(storageAdapter)) {
						throw ctx.error(400, {
							message:
								"Direct upload is only supported with the local storage adapter",
						});
					}

					// Better Call parses multipart/form-data into a plain object on ctx.body,
					// where each field's value is preserved as-is (File instances for file fields).
					const body = ctx.body as Record<string, unknown> | undefined;

					if (!body || typeof body !== "object") {
						throw ctx.error(400, {
							message: "Expected multipart/form-data request body",
						});
					}

					const fileRaw = body.file;

					// Use a duck-type check instead of instanceof File to avoid
					// cross-module-boundary failures (e.g. undici's File vs globalThis.File).
					if (
						!fileRaw ||
						typeof fileRaw !== "object" ||
						typeof (fileRaw as any).arrayBuffer !== "function"
					) {
						throw ctx.error(400, {
							message: "Missing 'file' field in form data",
						});
					}

					// Safe to treat as a File-like object after the duck-type check above.
					const file = fileRaw as Pick<
						File,
						"name" | "type" | "size" | "arrayBuffer"
					>;

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
					const folderId = (body.folderId as string | undefined) ?? undefined;

					if (folderId) {
						const folder = await getFolderById(adapter, folderId);
						if (!folder) {
							throw ctx.error(404, { message: "Folder not found" });
						}
					}

					const { url } = await storageAdapter.upload(buffer, {
						filename: file.name,
						mimeType: file.type,
						size: file.size,
						folderId,
					});

					// Create the DB record. If this fails, clean up the already-uploaded
					// storage file so it does not become a silently orphaned file.
					let asset: Asset;
					try {
						asset = await createAsset(adapter, {
							filename: url.split("/").pop() ?? file.name,
							originalName: file.name,
							mimeType: file.type,
							size: file.size,
							url,
							folderId,
						});
					} catch (err) {
						try {
							await storageAdapter.delete(url);
						} catch (cleanupErr) {
							console.error(
								`[btst/media] Failed to clean up orphaned storage file after DB error: ${url}`,
								cleanupErr,
							);
						}
						throw err;
					}

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

					let folderId: string | undefined = ctx.body.folderId;
					if (folderId) {
						const folder = await getFolderById(adapter, folderId);
						if (!folder) {
							throw ctx.error(404, {
								message: "Folder not found",
							});
						}
						folderId = folder.id;
					}
					const filename = sanitizeS3KeySegment(ctx.body.filename);

					return storageAdapter.generateUploadToken({
						filename,
						mimeType: ctx.body.mimeType,
						size: ctx.body.size,
						folderId,
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
							const filename = pathname.split("/").pop() ?? pathname;
							let parsed: Record<string, unknown> = {};
							try {
								parsed = clientPayload ? JSON.parse(clientPayload) : {};
							} catch {
								/* ignore invalid JSON — fall back to defaults */
							}
							const mimeType =
								(parsed.mimeType as string | undefined) ??
								"application/octet-stream";
							const size = parsed.size as number | undefined;

							if (hooks?.onBeforeUpload) {
								await runHookWithShim(
									() =>
										hooks.onBeforeUpload!(
											{ filename, mimeType, size },
											context,
										),
									ctx.error,
									"Unauthorized: Cannot upload asset",
								);
							}

							validateMimeType(mimeType, ctx);

							if (size != null && size > maxFileSizeBytes) {
								throw ctx.error(413, {
									message: `File size ${size} bytes exceeds the limit of ${maxFileSizeBytes} bytes`,
								});
							}

							return {
								addRandomSuffix: true,
								allowedContentTypes:
									allowedMimeTypes && allowedMimeTypes.length > 0
										? allowedMimeTypes
										: undefined,
								maximumSizeInBytes: maxFileSizeBytes,
							};
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
