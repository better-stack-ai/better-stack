import type {
	S3StorageAdapter,
	S3UploadToken,
	UploadOptions,
} from "../storage-adapter";

export interface S3StorageAdapterOptions {
	/**
	 * The S3 bucket name.
	 */
	bucket: string;
	/**
	 * AWS region (e.g. `"us-east-1"`).
	 */
	region: string;
	/**
	 * AWS access key ID.
	 */
	accessKeyId: string;
	/**
	 * AWS secret access key.
	 */
	secretAccessKey: string;
	/**
	 * Custom endpoint URL for S3-compatible providers (Cloudflare R2, MinIO, etc.).
	 * @example "https://<account-id>.r2.cloudflarestorage.com"
	 */
	endpoint?: string;
	/**
	 * Base URL used to construct the final public asset URL after upload.
	 * @example "https://assets.example.com" or "https://pub-<id>.r2.dev"
	 */
	publicBaseUrl: string;
	/**
	 * Duration in seconds for which the presigned URL is valid.
	 * @default 300 (5 minutes)
	 */
	expiresIn?: number;
}

/**
 * Create an S3-compatible presigned-URL storage adapter.
 * The server generates a short-lived presigned PUT URL; the browser uploads
 * the file directly to S3 (or R2 / MinIO). The server never receives file bytes.
 *
 * @remarks Requires `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
 * as optional peer dependencies.
 *
 * @example
 * ```ts
 * mediaBackendPlugin({
 *   storageAdapter: s3Adapter({
 *     bucket: "my-bucket",
 *     region: "us-east-1",
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *     publicBaseUrl: "https://assets.example.com",
 *   })
 * })
 * ```
 */
export function s3Adapter(options: S3StorageAdapterOptions): S3StorageAdapter {
	const {
		bucket,
		region,
		accessKeyId,
		secretAccessKey,
		endpoint,
		publicBaseUrl,
		expiresIn = 300,
	} = options;

	let clientPromise: Promise<
		InstanceType<typeof import("@aws-sdk/client-s3").S3Client>
	> | null = null;

	function getClient() {
		if (!clientPromise) {
			clientPromise = import("@aws-sdk/client-s3")
				.then(({ S3Client }) => {
					return new S3Client({
						region,
						endpoint,
						credentials: { accessKeyId, secretAccessKey },
						forcePathStyle: !!endpoint,
					});
				})
				.catch(() => {
					clientPromise = null;
					throw new Error(
						"[@btst/stack] S3 adapter requires '@aws-sdk/client-s3'. " +
							"Run: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner",
					);
				});
		}
		return clientPromise;
	}

	async function buildSignedUrl(
		client: unknown,
		command: unknown,
		opts: { expiresIn: number },
	): Promise<string> {
		let getSignedUrl: typeof import("@aws-sdk/s3-request-presigner")["getSignedUrl"];
		try {
			({ getSignedUrl } = await import("@aws-sdk/s3-request-presigner"));
		} catch {
			throw new Error(
				"[@btst/stack] S3 adapter requires '@aws-sdk/s3-request-presigner'. " +
					"Run: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner",
			);
		}
		return getSignedUrl(
			client as Parameters<typeof getSignedUrl>[0],
			command as Parameters<typeof getSignedUrl>[1],
			opts,
		);
	}

	return {
		type: "s3" as const,
		urlPrefix: publicBaseUrl.replace(/\/$/, ""),

		async generateUploadToken(
			uploadOptions: UploadOptions,
		): Promise<S3UploadToken> {
			const [client, { PutObjectCommand }] = await Promise.all([
				getClient(),
				import("@aws-sdk/client-s3"),
			]);

			const key = uploadOptions.folderId
				? `${uploadOptions.folderId}/${uploadOptions.filename}`
				: uploadOptions.filename;

			const command = new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				ContentType: uploadOptions.mimeType,
				ContentLength: uploadOptions.size,
			});

			const uploadUrl = await buildSignedUrl(client, command, { expiresIn });
			const publicUrl = `${publicBaseUrl.replace(/\/$/, "")}/${key}`;

			return {
				type: "presigned-url",
				payload: {
					uploadUrl,
					publicUrl,
					key,
					method: "PUT" as const,
					headers: { "Content-Type": uploadOptions.mimeType },
				},
			};
		},

		async delete(url: string): Promise<void> {
			const [client, { DeleteObjectCommand }] = await Promise.all([
				getClient(),
				import("@aws-sdk/client-s3"),
			]);

			const base = publicBaseUrl.replace(/\/$/, "");
			const key = url.startsWith(base)
				? url.slice(base.length + 1)
				: (url.split("/").pop() ?? url);

			await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
		},
	};
}
