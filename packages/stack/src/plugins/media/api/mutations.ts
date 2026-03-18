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
		// null explicitly clears the folder association; undefined means "not provided"
		update.folderId = input.folderId;
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
 * Child folders are cascade-deleted automatically. Throws if the folder or
 * any of its descendants contain assets (which have associated storage files
 * that must be deleted via the storage adapter first).
 * Pure DB function — no authorization hooks, no HTTP context.
 *
 * @remarks **Security:** No authorization hooks are called.
 */
export async function deleteFolder(
	adapter: Adapter,
	id: string,
): Promise<void> {
	// BFS to collect the target folder and all of its descendants.
	const allFolderIds: string[] = [id];
	const queue: string[] = [id];

	while (queue.length > 0) {
		const parentId = queue.shift()!;
		const children = await adapter.findMany<Folder>({
			model: "mediaFolder",
			where: [{ field: "parentId", value: parentId, operator: "eq" as const }],
		});
		for (const child of children) {
			allFolderIds.push(child.id);
			queue.push(child.id);
		}
	}

	// Reject the deletion if any folder in the subtree contains assets.
	// Assets map to real storage files — the caller must delete them via the
	// storage adapter before removing the DB records.
	let totalAssets = 0;
	for (const folderId of allFolderIds) {
		totalAssets += await adapter.count({
			model: "mediaAsset",
			where: [{ field: "folderId", value: folderId, operator: "eq" as const }],
		});
	}

	if (totalAssets > 0) {
		throw new Error(
			`Cannot delete folder: it or one of its subfolders contains ${totalAssets} asset(s). Move or delete them first.`,
		);
	}

	// Wrap all deletions in a transaction so the subtree is removed atomically.
	// If any individual deletion fails the entire subtree is left intact.
	await adapter.transaction(async (tx) => {
		// Delete deepest folders first, then work back up to the root.
		for (const folderId of [...allFolderIds].reverse()) {
			await tx.delete<Folder>({
				model: "mediaFolder",
				where: [{ field: "id", value: folderId, operator: "eq" as const }],
			});
		}
	});
}
