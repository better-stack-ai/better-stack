import type {
	VercelBlobStorageAdapter,
	VercelBlobHandlerCallbacks,
} from "../storage-adapter";

export interface VercelBlobStorageAdapterOptions {
	/**
	 * The `BLOB_READ_WRITE_TOKEN` environment variable is read automatically
	 * by `@vercel/blob`. You only need to provide this option if you store
	 * the token under a different name.
	 */
	token?: string;
}

/**
 * Minimal subset of the `@vercel/blob/server` `handleUpload` options.
 * Defined inline so we do not hard-depend on a specific `@vercel/blob` release.
 */
interface HandleUploadOptions {
	body: unknown;
	request: Request;
	token?: string;
	onBeforeGenerateToken: (
		pathname: string,
		clientPayload?: string | null,
	) => Promise<{
		addRandomSuffix?: boolean;
		allowedContentTypes?: string[];
		maximumSizeInBytes?: number;
	}>;
	onUploadCompleted: (args: {
		blob: { url: string; pathname: string };
		tokenPayload?: string | null;
	}) => Promise<void>;
}

type HandleUploadFn = (options: HandleUploadOptions) => Promise<unknown>;
type DelFn = (url: string, options?: { token?: string }) => Promise<void>;

/**
 * Create a Vercel Blob storage adapter using the signed direct-upload protocol.
 * The server never receives file bytes — it only issues short-lived client tokens
 * via `@vercel/blob`'s `handleUpload` helper (available via `@vercel/blob/server`
 * in compatible versions).
 *
 * @remarks Requires `@vercel/blob` as an optional peer dependency (version
 * with `handleUpload` exported from `@vercel/blob/server`).
 *
 * Upload flow:
 * 1. Client calls `POST /media/upload/vercel-blob` to obtain a client token.
 * 2. Client uses `@vercel/blob/client`'s `upload()` to upload directly to Vercel.
 * 3. After upload, client calls `POST /media/assets` to save metadata to the DB.
 *
 * @example
 * ```ts
 * mediaBackendPlugin({
 *   storageAdapter: vercelBlobAdapter(),
 *   hooks: {
 *     onBeforeUpload: async (_meta, ctx) => {
 *       const session = await getSession(ctx.headers);
 *       if (!session) throw new Error("Unauthorized");
 *     },
 *   },
 * })
 * ```
 */
export function vercelBlobAdapter(
	options: VercelBlobStorageAdapterOptions = {},
): VercelBlobStorageAdapter {
	return {
		type: "vercel-blob" as const,

		async handleRequest(
			request: Request,
			callbacks: VercelBlobHandlerCallbacks,
		): Promise<unknown> {
			let handleUpload: HandleUploadFn;
			try {
				const vercelBlobServer =
					/* @vite-ignore */
					// @ts-expect-error — @vercel/blob/server may not be exported in all installed versions
					(await import("@vercel/blob/server")) as {
						handleUpload: HandleUploadFn;
					};
				({ handleUpload } = vercelBlobServer);
			} catch {
				throw new Error(
					"[@btst/stack] Vercel Blob adapter requires '@vercel/blob' with " +
						"'handleUpload' exported from '@vercel/blob/server'. " +
						"Run: npm install @vercel/blob",
				);
			}

			const body = await request.json();

			return handleUpload({
				body,
				request,
				token: options.token,
				onBeforeGenerateToken: async (pathname, clientPayload) => {
					const tokenOptions =
						(await callbacks.onBeforeGenerateToken?.(
							pathname,
							clientPayload ?? null,
						)) ?? {};
					return {
						addRandomSuffix: true,
						...tokenOptions,
					};
				},
				onUploadCompleted: async () => {
					// DB record is created by the client calling POST /media/assets
					// after the upload completes. Nothing to do server-side here.
				},
			});
		},

		async delete(url: string): Promise<void> {
			let del: DelFn;
			try {
				({ del } = (await import("@vercel/blob")) as { del: DelFn });
			} catch {
				throw new Error(
					"[@btst/stack] Vercel Blob adapter requires '@vercel/blob'. " +
						"Run: npm install @vercel/blob",
				);
			}
			await del(url, options.token ? { token: options.token } : undefined);
		},
	};
}
