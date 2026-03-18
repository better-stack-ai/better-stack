import type {
	Asset,
	Folder,
	SerializedAsset,
	SerializedFolder,
} from "../types";

/**
 * Serialize an Asset for SSR/SSG use (convert dates to strings).
 * Pure function — no DB access, no hooks.
 */
export function serializeAsset(asset: Asset): SerializedAsset {
	return {
		...asset,
		createdAt: asset.createdAt.toISOString(),
	};
}

/**
 * Serialize a Folder for SSR/SSG use (convert dates to strings).
 * Pure function — no DB access, no hooks.
 */
export function serializeFolder(folder: Folder): SerializedFolder {
	return {
		...folder,
		createdAt: folder.createdAt.toISOString(),
	};
}
