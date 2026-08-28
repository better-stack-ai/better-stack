import type {
	VercelBlobStorageAdapter,
	VercelBlobHandlerCallbacks,
	VercelBlobHandleUploadBody,
} from "../storage-adapter";
import { createHmac, timingSafeEqual } from "node:crypto";

interface BoundUploadContext {
	version: 1;
	pathname: string;
	mimeType: string;
	size?: number;
	folderId?: string;
	tenantId?: string;
}

function callbackToken(options: VercelBlobStorageAdapterOptions): string {
	const token = options.token ?? process.env.BLOB_READ_WRITE_TOKEN;
	if (!token) {
		throw new Error(
			"[@btst/stack] Vercel Blob callback verification requires BLOB_READ_WRITE_TOKEN or an explicit token.",
		);
	}
	return token;
}

function parseBoundContext(
	value: string | null | undefined,
): BoundUploadContext {
	let parsed: unknown;
	try {
		parsed = value ? JSON.parse(value) : undefined;
	} catch {
		throw new Error("Invalid Vercel Blob callback token context.");
	}
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Missing Vercel Blob callback token context.");
	}
	const context = parsed as Record<string, unknown>;
	if (
		context.version !== 1 ||
		typeof context.pathname !== "string" ||
		!context.pathname ||
		typeof context.mimeType !== "string" ||
		!context.mimeType ||
		(context.size !== undefined &&
			(typeof context.size !== "number" ||
				!Number.isInteger(context.size) ||
				context.size < 0)) ||
		(context.folderId !== undefined &&
			(typeof context.folderId !== "string" || !context.folderId)) ||
		(context.tenantId !== undefined &&
			(typeof context.tenantId !== "string" || !context.tenantId))
	) {
		throw new Error("Invalid Vercel Blob callback token context.");
	}
	return context as unknown as BoundUploadContext;
}

export interface VercelBlobStorageAdapterOptions {
	/**
	 * The `BLOB_READ_WRITE_TOKEN` environment variable is read automatically
	 * by `@vercel/blob`. You only need to provide this option if you store
	 * the token under a different name.
	 */
	token?: string;
}

/**
 * Minimal subset of the `@vercel/blob/client` `handleUpload` options.
 * Defined inline so we do not hard-depend on a specific `@vercel/blob` release.
 */
interface HandleUploadOptions {
	body: VercelBlobHandleUploadBody;
	request: Request;
	token?: string;
	onBeforeGenerateToken: (
		pathname: string,
		clientPayload?: string | null,
	) => Promise<{
		addRandomSuffix?: boolean;
		allowedContentTypes?: string[];
		maximumSizeInBytes?: number;
		tokenPayload?: string;
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
 * via `@vercel/blob`'s `handleUpload` helper (available via `@vercel/blob/client`
 * in compatible versions).
 *
 * @remarks Requires `@vercel/blob` as an optional peer dependency (version
 * with `handleUpload` exported from `@vercel/blob/client`).
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
 * })
 * ```
 * Bind `mediaPermissions.asset.upload` through stack auth to authorize token
 * initialization/finalization; hooks are lifecycle callbacks, not auth rules.
 */
export function vercelBlobAdapter(
	options: VercelBlobStorageAdapterOptions = {},
): VercelBlobStorageAdapter {
	return {
		type: "vercel-blob" as const,
		urlHostnameSuffix: ".public.blob.vercel-storage.com",

		async verifyCallback(request, body) {
			const signature = request.headers.get("x-vercel-signature");
			if (!signature)
				throw new Error("Missing Vercel Blob callback signature.");
			const expected = createHmac("sha256", callbackToken(options))
				.update(JSON.stringify(body))
				.digest();
			let actual: Buffer;
			try {
				actual = Buffer.from(signature, "hex");
			} catch {
				throw new Error("Invalid Vercel Blob callback signature.");
			}
			if (
				actual.length !== expected.length ||
				!timingSafeEqual(actual, expected)
			) {
				throw new Error("Invalid Vercel Blob callback signature.");
			}
			const { version: _version, ...context } = parseBoundContext(
				body.payload.tokenPayload,
			);
			return context;
		},

		async handleRequest(
			request: Request,
			body: VercelBlobHandleUploadBody,
			callbacks: VercelBlobHandlerCallbacks,
		): Promise<unknown> {
			let handleUpload: HandleUploadFn;
			try {
				const vercelBlobClient =
					/* @vite-ignore */
					(await import("@vercel/blob/client")) as unknown as {
						handleUpload: HandleUploadFn;
					};
				({ handleUpload } = vercelBlobClient);
			} catch {
				throw new Error(
					"[@btst/stack] Vercel Blob adapter requires '@vercel/blob' with " +
						"'handleUpload' exported from '@vercel/blob/client'. " +
						"Run: npm install @vercel/blob",
				);
			}

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
