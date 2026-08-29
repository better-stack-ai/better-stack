"use client";

import type { SerializedAsset } from "../types";
import type { MediaUploadMode } from "./overrides";
import { compressImage } from "./utils/image-compression";
import type { ImageCompressionOptions } from "./utils/image-compression";

export interface MediaUploadClientConfig {
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
	credentials?: RequestCredentials;
	uploadMode?: MediaUploadMode;
	imageCompression?: ImageCompressionOptions | false;
}

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
		credentials,
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
			credentials,
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
			credentials,
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
			credentials,
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
		const handleUploadUrl = `${base}/media/upload/vercel-blob`;
		const clientPayload = JSON.stringify({
			mimeType: processedFile.type,
			size: processedFile.size,
			...(folderId ? { folderId } : {}),
		});
		const tokenRes = await fetch(handleUploadUrl, {
			method: "POST",
			headers: {
				...Object.fromEntries(headersObj.entries()),
				"Content-Type": "application/json",
			},
			credentials,
			body: JSON.stringify({
				type: "blob.generate-client-token",
				payload: {
					pathname: processedFile.name,
					callbackUrl: handleUploadUrl,
					clientPayload,
					multipart: false,
				},
			}),
		});
		if (!tokenRes.ok) {
			const err = await tokenRes
				.json()
				.catch(() => ({ message: tokenRes.statusText }));
			throw new Error(err.message ?? "Failed to get Vercel Blob upload token");
		}
		const { clientToken } = (await tokenRes.json()) as {
			clientToken?: string;
		};
		if (!clientToken) {
			throw new Error("Failed to get Vercel Blob upload token");
		}

		// Dynamic import keeps @vercel/blob/client optional. The app-authenticated
		// token exchange stays under our fetch control; the scoped token alone is
		// then sent to Vercel's storage origin.
		const { put } = await import("@vercel/blob/client");
		const blob = await put(processedFile.name, processedFile, {
			access: "public",
			token: clientToken,
		});

		const assetRes = await fetch(`${base}/media/assets`, {
			method: "POST",
			headers: {
				...Object.fromEntries(headersObj.entries()),
				"Content-Type": "application/json",
			},
			credentials,
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
