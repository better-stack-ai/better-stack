/**
 * Options provided to storage adapters when initiating an upload.
 */
export interface UploadOptions {
	filename: string;
	mimeType: string;
	size: number;
	folderId?: string;
}

/**
 * Local storage adapter — backend receives and stores file bytes directly.
 * Suitable for development and self-hosted deployments.
 */
export interface DirectStorageAdapter {
	readonly type: "local";
	/**
	 * Store the file buffer and return the public URL.
	 */
	upload(buffer: Buffer, options: UploadOptions): Promise<{ url: string }>;
	/**
	 * Remove the stored file given its public URL.
	 */
	delete(url: string): Promise<void>;
}

/**
 * Token returned by the S3 adapter.
 * The client performs a `PUT` to `payload.uploadUrl` with the file body,
 * then saves `payload.publicUrl` as the asset URL.
 */
export interface S3UploadToken {
	type: "presigned-url";
	payload: {
		uploadUrl: string;
		publicUrl: string;
		key: string;
		method: "PUT";
		headers: Record<string, string>;
	};
}

/**
 * S3 storage adapter — server issues a short-lived presigned PUT URL;
 * the browser uploads directly to S3 (or R2 / MinIO).
 */
export interface S3StorageAdapter {
	readonly type: "s3";
	/**
	 * Generate a presigned PUT URL for direct client upload.
	 */
	generateUploadToken(options: UploadOptions): Promise<S3UploadToken>;
	/**
	 * Remove the stored object given its public URL.
	 */
	delete(url: string): Promise<void>;
}

/**
 * Options returned from onBeforeGenerateToken and passed to Vercel Blob's handleUpload.
 */
export interface VercelBlobTokenOptions {
	addRandomSuffix?: boolean;
	allowedContentTypes?: string[];
	maximumSizeInBytes?: number;
}

/**
 * Callbacks provided to the Vercel Blob adapter when handling a request.
 */
export interface VercelBlobHandlerCallbacks {
	/**
	 * Called before a client token is generated.
	 * Throw to reject the upload (auth gate).
	 * Return options to enforce allowedContentTypes and maximumSizeInBytes at the edge.
	 */
	onBeforeGenerateToken?: (
		pathname: string,
		clientPayload: string | null,
	) => Promise<VercelBlobTokenOptions | void> | VercelBlobTokenOptions | void;
}

/**
 * Vercel Blob storage adapter — uses the `@vercel/blob/server` `handleUpload`
 * protocol. The same endpoint handles both token generation and upload
 * completion notifications from Vercel's servers.
 */
export interface VercelBlobStorageAdapter {
	readonly type: "vercel-blob";
	/**
	 * Process a raw request from `@vercel/blob/client`'s `upload()` or from
	 * Vercel Blob's upload-completion webhook. Returns a JSON-serialisable object
	 * that should be sent back as the response body.
	 */
	handleRequest(
		request: Request,
		callbacks: VercelBlobHandlerCallbacks,
	): Promise<unknown>;
	/**
	 * Remove the stored blob given its public URL.
	 */
	delete(url: string): Promise<void>;
}

export type StorageAdapter =
	| DirectStorageAdapter
	| S3StorageAdapter
	| VercelBlobStorageAdapter;

export function isDirectAdapter(
	adapter: StorageAdapter,
): adapter is DirectStorageAdapter {
	return adapter.type === "local";
}

export function isS3Adapter(
	adapter: StorageAdapter,
): adapter is S3StorageAdapter {
	return adapter.type === "s3";
}

export function isVercelBlobAdapter(
	adapter: StorageAdapter,
): adapter is VercelBlobStorageAdapter {
	return adapter.type === "vercel-blob";
}
