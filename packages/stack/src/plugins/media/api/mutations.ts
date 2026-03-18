import type { DBAdapter as Adapter } from "@btst/db";
import type { Asset, Folder } from "../types";

/**
 * Input for creating a new asset record.
 */
export interface CreateAssetInput {
	filename: string;
	originalName: string;
	mimeType: string;
	size: number;
	url: string;
	folderId?: string;
	alt?: string;
}

/**
 * Input for updating an existing asset record.
 */
export interface UpdateAssetInput {
	alt?: string;
	folderId?: string | null;
}

/**
 * Input for creating a new folder.
 */
export interface CreateFolderInput {
	name: string;
	parentId?: string;
}

/**
 * Create an asset record in the database.
 * Pure DB function — no authorization hooks, no HTTP context.
 *
 * @remarks **Security:** No authorization hooks (e.g. `onBeforeUpload`) are called.
 * The caller is responsible for any access-control checks before invoking this function.
 */
export async function createAsset(
	adapter: Adapter,
	input: CreateAssetInput,
): Promise<Asset> {
	return adapter.create<Asset>({
		model: "mediaAsset",
		data: {
			filename: input.filename,
			originalName: input.originalName,
			mimeType: input.mimeType,
			size: input.size,
			url: input.url,
			folderId: input.folderId,
			alt: input.alt,
			createdAt: new Date(),
		},
	});
}

/**
 * Update an asset's `alt` text or `folderId`.
 * Pure DB function — no authorization hooks, no HTTP context.
 *
 * @remarks **Security:** No authorization hooks are called.
 */
export async function updateAsset(
	adapter: Adapter,
	id: string,
	input: UpdateAssetInput,
): Promise<Asset | null> {
	const update: Record<string, unknown> = {};

	if (input.alt !== undefined) {
		update.alt = input.alt;
	}

	if ("folderId" in input) {
		// null explicitly clears the folder association
		update.folderId = input.folderId === null ? undefined : input.folderId;
	}

	return adapter.update<Asset>({
		model: "mediaAsset",
		where: [{ field: "id", value: id, operator: "eq" as const }],
		update,
	});
}

/**
 * Delete an asset record from the database by its ID.
 * Does NOT delete the underlying file — the caller must do that via the storage adapter.
 * Pure DB function — no authorization hooks, no HTTP context.
 *
 * @remarks **Security:** No authorization hooks are called.
 */
export async function deleteAsset(adapter: Adapter, id: string): Promise<void> {
	await adapter.delete<Asset>({
		model: "mediaAsset",
		where: [{ field: "id", value: id, operator: "eq" as const }],
	});
}

/**
 * Create a folder record in the database.
 * Pure DB function — no authorization hooks, no HTTP context.
 *
 * @remarks **Security:** No authorization hooks are called.
 */
export async function createFolder(
	adapter: Adapter,
	input: CreateFolderInput,
): Promise<Folder> {
	return adapter.create<Folder>({
		model: "mediaFolder",
		data: {
			name: input.name,
			parentId: input.parentId,
			createdAt: new Date(),
		},
	});
}

/**
 * Delete a folder record from the database by its ID.
 * Throws if any assets exist inside the folder.
 * Pure DB function — no authorization hooks, no HTTP context.
 *
 * @remarks **Security:** No authorization hooks are called.
 */
export async function deleteFolder(
	adapter: Adapter,
	id: string,
): Promise<void> {
	const assetsInFolder = await adapter.count({
		model: "mediaAsset",
		where: [{ field: "folderId", value: id, operator: "eq" as const }],
	});

	if (assetsInFolder > 0) {
		throw new Error(
			`Cannot delete folder: it contains ${assetsInFolder} asset(s). Move or delete them first.`,
		);
	}

	await adapter.delete<Folder>({
		model: "mediaFolder",
		where: [{ field: "id", value: id, operator: "eq" as const }],
	});
}
