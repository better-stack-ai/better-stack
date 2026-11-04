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
	const { updatedAt: _updatedAt, ...value } = asset;
	return {
		...value,
		createdAt: asset.createdAt.toISOString(),
	};
}

/**
 * Serialize a Folder for SSR/SSG use (convert dates to strings).
 * Pure function — no DB access, no hooks.
 */
export function serializeFolder(folder: Folder): SerializedFolder {
	const { updatedAt: _updatedAt, ...value } = folder;
	return {
		...value,
		createdAt: folder.createdAt.toISOString(),
	};
}
