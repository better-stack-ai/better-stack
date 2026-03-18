import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { DBAdapter as Adapter } from "@btst/db";
import { mediaSchema } from "../db";
import type { Asset, Folder } from "../types";
import {
	createAsset,
	updateAsset,
	deleteAsset,
	createFolder,
	deleteFolder,
} from "../api/mutations";
import { getAssetById, getFolderById } from "../api/getters";

const createTestAdapter = (): Adapter => {
	const db = defineDb({}).use(mediaSchema);
	return createMemoryAdapter(db)({});
};

const assetInput = {
	filename: "photo.jpg",
	originalName: "My Photo.jpg",
	mimeType: "image/jpeg",
	size: 2048,
	url: "https://example.com/photo.jpg",
};

describe("media mutations", () => {
	let adapter: Adapter;

	beforeEach(() => {
		adapter = createTestAdapter();
	});

	// ── createAsset ───────────────────────────────────────────────────────────

	describe("createAsset", () => {
		it("creates an asset with required fields", async () => {
			const asset = await createAsset(adapter, assetInput);

			expect(asset.id).toBeDefined();
			expect(asset.filename).toBe("photo.jpg");
			expect(asset.originalName).toBe("My Photo.jpg");
			expect(asset.mimeType).toBe("image/jpeg");
			expect(asset.size).toBe(2048);
			expect(asset.url).toBe("https://example.com/photo.jpg");
			expect(asset.createdAt).toBeInstanceOf(Date);
		});

		it("creates an asset with optional fields", async () => {
			const asset = await createAsset(adapter, {
				...assetInput,
				folderId: "folder-123",
				alt: "A beautiful photo",
			});

			expect(asset.folderId).toBe("folder-123");
			expect(asset.alt).toBe("A beautiful photo");
		});

		it("creates multiple independent assets", async () => {
			await createAsset(adapter, {
				...assetInput,
				filename: "a.jpg",
				url: "https://example.com/a.jpg",
			});
			await createAsset(adapter, {
				...assetInput,
				filename: "b.jpg",
				url: "https://example.com/b.jpg",
			});

			const all = await adapter.findMany<Asset>({ model: "mediaAsset" });
			expect(all).toHaveLength(2);
		});
	});

	// ── updateAsset ───────────────────────────────────────────────────────────

	describe("updateAsset", () => {
		it("updates the alt text of an asset", async () => {
			const asset = await createAsset(adapter, assetInput);
			const updated = await updateAsset(adapter, asset.id, {
				alt: "Updated alt text",
			});

			expect(updated).not.toBeNull();
			expect(updated!.alt).toBe("Updated alt text");
		});

		it("updates the folderId of an asset", async () => {
			const asset = await createAsset(adapter, assetInput);
			const updated = await updateAsset(adapter, asset.id, {
				folderId: "folder-abc",
			});

			expect(updated!.folderId).toBe("folder-abc");
		});

		it("returns the updated asset when only folderId is changed", async () => {
			const asset = await createAsset(adapter, {
				...assetInput,
				folderId: "folder-old",
			});
			const updated = await updateAsset(adapter, asset.id, {
				folderId: "folder-new",
			});

			expect(updated).not.toBeNull();
			expect(updated!.folderId).toBe("folder-new");
		});

		it("returns null for nonexistent asset", async () => {
			const result = await updateAsset(adapter, "nonexistent-id", {
				alt: "test",
			});
			expect(result).toBeNull();
		});
	});

	// ── deleteAsset ───────────────────────────────────────────────────────────

	describe("deleteAsset", () => {
		it("removes the asset from the database", async () => {
			const asset = await createAsset(adapter, assetInput);
			await deleteAsset(adapter, asset.id);

			const found = await getAssetById(adapter, asset.id);
			expect(found).toBeNull();
		});

		it("does not throw when deleting a nonexistent asset", async () => {
			await expect(
				deleteAsset(adapter, "nonexistent-id"),
			).resolves.not.toThrow();
		});

		it("only deletes the targeted asset", async () => {
			const a = await createAsset(adapter, {
				...assetInput,
				filename: "a.jpg",
				url: "https://example.com/a.jpg",
			});
			await createAsset(adapter, {
				...assetInput,
				filename: "b.jpg",
				url: "https://example.com/b.jpg",
			});

			await deleteAsset(adapter, a.id);

			const remaining = await adapter.findMany<Asset>({ model: "mediaAsset" });
			expect(remaining).toHaveLength(1);
			expect(remaining[0]!.filename).toBe("b.jpg");
		});
	});

	// ── createFolder ──────────────────────────────────────────────────────────

	describe("createFolder", () => {
		it("creates a root folder", async () => {
			const folder = await createFolder(adapter, { name: "Uploads" });

			expect(folder.id).toBeDefined();
			expect(folder.name).toBe("Uploads");
			expect(folder.parentId).toBeUndefined();
			expect(folder.createdAt).toBeInstanceOf(Date);
		});

		it("creates a nested folder with parentId", async () => {
			const parent = await createFolder(adapter, { name: "Root" });
			const child = await createFolder(adapter, {
				name: "Photos",
				parentId: parent.id,
			});

			expect(child.parentId).toBe(parent.id);
		});
	});

	// ── deleteFolder ──────────────────────────────────────────────────────────

	describe("deleteFolder", () => {
		it("deletes an empty folder", async () => {
			const folder = await createFolder(adapter, { name: "Empty" });
			await deleteFolder(adapter, folder.id);

			const found = await getFolderById(adapter, folder.id);
			expect(found).toBeNull();
		});

		it("throws an error when the folder contains assets", async () => {
			const folder = await createFolder(adapter, { name: "Full Folder" });
			await createAsset(adapter, { ...assetInput, folderId: folder.id });

			await expect(deleteFolder(adapter, folder.id)).rejects.toThrow(
				"Cannot delete folder",
			);

			const stillExists = await getFolderById(adapter, folder.id);
			expect(stillExists).not.toBeNull();
		});

		it("allows deletion after assets are removed", async () => {
			const folder = await createFolder(adapter, { name: "Soon Empty" });
			const asset = await createAsset(adapter, {
				...assetInput,
				folderId: folder.id,
			});

			await deleteAsset(adapter, asset.id);
			await expect(deleteFolder(adapter, folder.id)).resolves.not.toThrow();

			const found = await getFolderById(adapter, folder.id);
			expect(found).toBeNull();
		});

		it("does not throw when deleting a nonexistent folder", async () => {
			await expect(
				deleteFolder(adapter, "nonexistent-id"),
			).resolves.not.toThrow();
		});

		it("only deletes the targeted folder", async () => {
			const a = await createFolder(adapter, { name: "Folder A" });
			await createFolder(adapter, { name: "Folder B" });

			await deleteFolder(adapter, a.id);

			const remaining = await adapter.findMany<Folder>({
				model: "mediaFolder",
			});
			expect(remaining).toHaveLength(1);
			expect(remaining[0]!.name).toBe("Folder B");
		});
	});
});
