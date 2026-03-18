import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { DBAdapter as Adapter } from "@btst/db";
import { mediaSchema } from "../db";
import {
	listAssets,
	getAssetById,
	listFolders,
	getFolderById,
} from "../api/getters";

const createTestAdapter = (): Adapter => {
	const db = defineDb({}).use(mediaSchema);
	return createMemoryAdapter(db)({});
};

const makeAsset = (
	overrides: Partial<{
		filename: string;
		originalName: string;
		mimeType: string;
		size: number;
		url: string;
		folderId: string | undefined;
		alt: string | undefined;
	}> = {},
) => ({
	filename: "image.jpg",
	originalName: "My Image.jpg",
	mimeType: "image/jpeg",
	size: 1024,
	url: "https://example.com/image.jpg",
	folderId: undefined,
	alt: undefined,
	createdAt: new Date(),
	...overrides,
});

const makeFolder = (
	overrides: Partial<{
		name: string;
		parentId: string | undefined;
	}> = {},
) => ({
	name: "My Folder",
	parentId: undefined,
	createdAt: new Date(),
	...overrides,
});

describe("media getters", () => {
	let adapter: Adapter;

	beforeEach(() => {
		adapter = createTestAdapter();
	});

	// ── listAssets ────────────────────────────────────────────────────────────

	describe("listAssets", () => {
		it("returns empty result when no assets exist", async () => {
			const result = await listAssets(adapter);
			expect(result.items).toEqual([]);
			expect(result.total).toBe(0);
		});

		it("returns all assets with correct fields", async () => {
			await adapter.create({
				model: "mediaAsset",
				data: makeAsset({
					filename: "photo.jpg",
					url: "https://example.com/photo.jpg",
				}),
			});

			const result = await listAssets(adapter);
			expect(result.items).toHaveLength(1);
			expect(result.total).toBe(1);
			expect(result.items[0]!.filename).toBe("photo.jpg");
			expect(result.items[0]!.mimeType).toBe("image/jpeg");
		});

		it("filters assets by folderId", async () => {
			await adapter.create({
				model: "mediaFolder",
				data: makeFolder({ name: "Photos" }),
			});
			const folder = await adapter.findOne<{ id: string }>({
				model: "mediaFolder",
				where: [{ field: "name", value: "Photos", operator: "eq" }],
			});

			await adapter.create({
				model: "mediaAsset",
				data: makeAsset({ filename: "in-folder.jpg", folderId: folder!.id }),
			});
			await adapter.create({
				model: "mediaAsset",
				data: makeAsset({ filename: "no-folder.jpg" }),
			});

			const result = await listAssets(adapter, { folderId: folder!.id });
			expect(result.items).toHaveLength(1);
			expect(result.items[0]!.filename).toBe("in-folder.jpg");
		});

		it("filters assets by mimeType", async () => {
			await adapter.create({
				model: "mediaAsset",
				data: makeAsset({ filename: "image.jpg", mimeType: "image/jpeg" }),
			});
			await adapter.create({
				model: "mediaAsset",
				data: makeAsset({ filename: "doc.pdf", mimeType: "application/pdf" }),
			});

			const images = await listAssets(adapter, { mimeType: "image/jpeg" });
			expect(images.items).toHaveLength(1);
			expect(images.items[0]!.filename).toBe("image.jpg");

			const pdfs = await listAssets(adapter, { mimeType: "application/pdf" });
			expect(pdfs.items).toHaveLength(1);
			expect(pdfs.items[0]!.filename).toBe("doc.pdf");
		});

		it("searches assets by query string across filename, originalName, and alt", async () => {
			await adapter.create({
				model: "mediaAsset",
				data: makeAsset({
					filename: "holiday-photo.jpg",
					originalName: "Holiday Photo.jpg",
					alt: "Beach sunset",
				}),
			});
			await adapter.create({
				model: "mediaAsset",
				data: makeAsset({
					filename: "logo.png",
					originalName: "Company Logo.png",
					alt: "Brand logo",
				}),
			});

			const holidayResult = await listAssets(adapter, { query: "holiday" });
			expect(holidayResult.items).toHaveLength(1);
			expect(holidayResult.items[0]!.filename).toBe("holiday-photo.jpg");

			// "beach" matches only the alt text of the first asset
			const beachResult = await listAssets(adapter, { query: "beach" });
			expect(beachResult.items).toHaveLength(1);
			expect(beachResult.items[0]!.alt).toBe("Beach sunset");

			// "logo" matches only the second asset (filename, originalName, alt)
			const logoResult = await listAssets(adapter, { query: "logo" });
			expect(logoResult.items).toHaveLength(1);
			expect(logoResult.items[0]!.filename).toBe("logo.png");

			// "photo" matches only the first asset via filename and originalName
			const photoResult = await listAssets(adapter, { query: "photo" });
			expect(photoResult.items).toHaveLength(1);
			expect(photoResult.items[0]!.filename).toBe("holiday-photo.jpg");
		});

		it("paginates results with limit and offset", async () => {
			for (let i = 0; i < 5; i++) {
				await adapter.create({
					model: "mediaAsset",
					data: makeAsset({
						filename: `asset-${i}.jpg`,
						url: `https://example.com/${i}.jpg`,
					}),
				});
			}

			const page1 = await listAssets(adapter, { limit: 2, offset: 0 });
			expect(page1.items).toHaveLength(2);
			expect(page1.total).toBe(5);

			const page2 = await listAssets(adapter, { limit: 2, offset: 2 });
			expect(page2.items).toHaveLength(2);
			expect(page2.total).toBe(5);

			const page3 = await listAssets(adapter, { limit: 2, offset: 4 });
			expect(page3.items).toHaveLength(1);
			expect(page3.total).toBe(5);
		});
	});

	// ── getAssetById ─────────────────────────────────────────────────────────

	describe("getAssetById", () => {
		it("returns null when asset does not exist", async () => {
			const result = await getAssetById(adapter, "nonexistent-id");
			expect(result).toBeNull();
		});

		it("returns the asset by ID", async () => {
			const created = await adapter.create<{ id: string }>({
				model: "mediaAsset",
				data: makeAsset({ filename: "found.jpg" }),
			});

			const result = await getAssetById(adapter, created.id);
			expect(result).not.toBeNull();
			expect(result!.filename).toBe("found.jpg");
		});
	});

	// ── listFolders ───────────────────────────────────────────────────────────

	describe("listFolders", () => {
		it("returns empty array when no folders exist", async () => {
			const result = await listFolders(adapter);
			expect(result).toEqual([]);
		});

		it("returns all folders sorted by name", async () => {
			await adapter.create({
				model: "mediaFolder",
				data: makeFolder({ name: "Zeta" }),
			});
			await adapter.create({
				model: "mediaFolder",
				data: makeFolder({ name: "Alpha" }),
			});

			const result = await listFolders(adapter);
			expect(result).toHaveLength(2);
			expect(result[0]!.name).toBe("Alpha");
			expect(result[1]!.name).toBe("Zeta");
		});

		it("filters folders by parentId", async () => {
			const root = await adapter.create<{ id: string }>({
				model: "mediaFolder",
				data: makeFolder({ name: "Root" }),
			});
			await adapter.create({
				model: "mediaFolder",
				data: makeFolder({ name: "Child", parentId: root.id }),
			});

			// No params — returns ALL folders
			const allFolders = await listFolders(adapter);
			expect(allFolders).toHaveLength(2);

			// Filter children of root
			const childFolders = await listFolders(adapter, { parentId: root.id });
			expect(childFolders).toHaveLength(1);
			expect(childFolders[0]!.name).toBe("Child");
		});
	});

	// ── getFolderById ─────────────────────────────────────────────────────────

	describe("getFolderById", () => {
		it("returns null when folder does not exist", async () => {
			const result = await getFolderById(adapter, "nonexistent-id");
			expect(result).toBeNull();
		});

		it("returns the folder by ID", async () => {
			const created = await adapter.create<{ id: string }>({
				model: "mediaFolder",
				data: makeFolder({ name: "Test Folder" }),
			});

			const result = await getFolderById(adapter, created.id);
			expect(result).not.toBeNull();
			expect(result!.name).toBe("Test Folder");
		});
	});
});
