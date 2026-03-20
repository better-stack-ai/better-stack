"use client";

import type { SerializedAsset } from "../types";
import type { MediaPluginOverrides } from "./overrides";
import { compressImage } from "./utils/image-compression";

export type MediaUploadClientConfig = Pick<
	MediaPluginOverrides,
	"apiBaseURL" | "apiBasePath" | "headers" | "uploadMode" | "imageCompression"
>;

export interface UploadAssetInput {
	file: File;
	folderId?: string;
}

const DEFAULT_IMAGE_COMPRESSION = {
	maxWidth: 2048,
	maxHeight: 2048,
	quality: 0.85,
} as const;

/**
 * Upload an asset using the media plugin's configured storage mode.
 *
 * Use this in non-React contexts like editor `uploadImage` callbacks. React
 * components should usually prefer `useUploadAsset()`, which wraps this helper
 * and handles cache invalidation.
 */
export async function uploadAsset(
	config: MediaUploadClientConfig,
	input: UploadAssetInput,
): Promise<SerializedAsset> {
	const {
		apiBaseURL,
		apiBasePath,
		headers,
		uploadMode = "direct",
		imageCompression,
	} = config;
	const { file, folderId } = input;

	const processedFile =
		imageCompression === false
			? file
			: await compressImage(
					file,
					imageCompression ?? DEFAULT_IMAGE_COMPRESSION,
				);

	const base = `${apiBaseURL}${apiBasePath}`;
	const headersObj = new Headers(headers as HeadersInit | undefined);

	if (uploadMode === "direct") {
		const formData = new FormData();
		formData.append("file", processedFile);
		if (folderId) formData.append("folderId", folderId);

		const res = await fetch(`${base}/media/upload`, {
			method: "POST",
			headers: headersObj,
			body: formData,
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({ message: res.statusText }));
			throw new Error(err.message ?? "Upload failed");
		}
		return res.json();
	}

	if (uploadMode === "s3") {
		const tokenRes = await fetch(`${base}/media/upload/token`, {
			method: "POST",
			headers: {
				...Object.fromEntries(headersObj.entries()),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				filename: processedFile.name,
				mimeType: processedFile.type,
				size: processedFile.size,
				folderId,
			}),
		});
		if (!tokenRes.ok) {
			const err = await tokenRes
				.json()
				.catch(() => ({ message: tokenRes.statusText }));
			throw new Error(err.message ?? "Failed to get upload token");
		}

		const token = (await tokenRes.json()) as {
			type: "presigned-url";
			payload: {
				uploadUrl: string;
				publicUrl: string;
				key: string;
				method: "PUT";
				headers: Record<string, string>;
			};
		};

		const putRes = await fetch(token.payload.uploadUrl, {
			method: "PUT",
			headers: token.payload.headers,
			body: processedFile,
		});
		if (!putRes.ok) throw new Error("Failed to upload to S3");

		const assetRes = await fetch(`${base}/media/assets`, {
			method: "POST",
			headers: {
				...Object.fromEntries(headersObj.entries()),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				filename: processedFile.name,
				originalName: file.name,
				mimeType: processedFile.type,
				size: processedFile.size,
				url: token.payload.publicUrl,
				folderId,
			}),
		});
		if (!assetRes.ok) {
			const err = await assetRes
				.json()
				.catch(() => ({ message: assetRes.statusText }));
			throw new Error(err.message ?? "Failed to register asset");
		}
		return assetRes.json();
	}

	if (uploadMode === "vercel-blob") {
		// Dynamic import keeps @vercel/blob/client optional.
		const { upload } = await import("@vercel/blob/client");
		const blob = await upload(processedFile.name, processedFile, {
			access: "public",
			handleUploadUrl: `${base}/media/upload/vercel-blob`,
			clientPayload: JSON.stringify({
				mimeType: processedFile.type,
				size: processedFile.size,
			}),
		});

		const assetRes = await fetch(`${base}/media/assets`, {
			method: "POST",
			headers: {
				...Object.fromEntries(headersObj.entries()),
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				filename: processedFile.name,
				originalName: file.name,
				mimeType: processedFile.type,
				size: processedFile.size,
				url: blob.url,
				folderId,
			}),
		});
		if (!assetRes.ok) {
			const err = await assetRes
				.json()
				.catch(() => ({ message: assetRes.statusText }));
			throw new Error(err.message ?? "Failed to register asset");
		}
		return assetRes.json();
	}

	throw new Error(`Unknown uploadMode: ${uploadMode}`);
}
