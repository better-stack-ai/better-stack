import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { DirectStorageAdapter, UploadOptions } from "../storage-adapter";

export interface LocalStorageAdapterOptions {
	/**
	 * Absolute path to the directory where uploaded files are stored.
	 * @default "./public/uploads"
	 */
	uploadDir?: string;
	/**
	 * URL prefix used to build the public URL for uploaded files.
	 * @default "/uploads"
	 */
	publicPath?: string;
}

/**
 * Create a local filesystem storage adapter.
 * Files are written to `uploadDir` and served at `publicPath`.
 * Suitable for development and self-hosted deployments.
 *
 * @example
 * ```ts
 * mediaBackendPlugin({
 *   storageAdapter: localAdapter({ uploadDir: "./public/uploads", publicPath: "/uploads" })
 * })
 * ```
 */
export function localAdapter(
	options: LocalStorageAdapterOptions = {},
): DirectStorageAdapter {
	const uploadDir = options.uploadDir ?? "./public/uploads";
	const publicPath = options.publicPath ?? "/uploads";

	return {
		type: "local" as const,

		async upload(
			buffer: Buffer,
			{ filename }: UploadOptions,
		): Promise<{ url: string }> {
			await fs.mkdir(uploadDir, { recursive: true });

			const ext = path.extname(filename);
			const base = path.basename(filename, ext);
			const unique = crypto.randomBytes(8).toString("hex");
			const storedFilename = `${base}-${unique}${ext}`;
			const filePath = path.join(uploadDir, storedFilename);

			await fs.writeFile(filePath, buffer);

			const url = `${publicPath.replace(/\/$/, "")}/${storedFilename}`;
			return { url };
		},

		async delete(url: string): Promise<void> {
			const filename = url.split("/").pop();
			if (!filename) return;

			const filePath = path.join(uploadDir, filename);
			try {
				await fs.unlink(filePath);
			} catch (err: unknown) {
				if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
					throw err;
				}
			}
		},
	};
}
