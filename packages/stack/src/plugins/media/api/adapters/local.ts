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

			// Percent-encode the filename segment so the returned URL is always a
			// valid URL — e.g. spaces become %20. The raw storedFilename is used for
			// the filesystem path; the encoded form is what gets stored in the DB and
			// served to clients.
			const url = `${publicPath.replace(/\/$/, "")}/${encodeURIComponent(storedFilename)}`;
			return { url };
		},

		async delete(url: string): Promise<void> {
			// The stored URL has an encoded filename (e.g. "my%20file.png"); decode
			// it back to the raw filesystem name before building the file path.
			const encodedFilename = url.split("/").pop();
			if (!encodedFilename) return;
			const filename = decodeURIComponent(encodedFilename);

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
