import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { DBAdapter as Adapter } from "@btst/db";
import { mediaSchema } from "../db";
import { listAssets } from "../api/getters";
import {
	MEDIA_QUERY_KEYS,
	assetListDiscriminator,
} from "../api/query-key-defs";

const createTestAdapter = (): Adapter => {
	const db = defineDb({}).use(mediaSchema);
	return createMemoryAdapter(db)({});
};

const makeAsset = (index: number) => ({
	filename: `asset-${index}.jpg`,
	originalName: `Asset ${index}.jpg`,
	mimeType: "image/jpeg",
	size: 1024 + index,
	url: `https://example.com/${index}.jpg`,
	createdAt: new Date(Date.now() + index),
});

describe("media asset list query keys", () => {
	let adapter: Adapter;

	beforeEach(() => {
		adapter = createTestAdapter();
	});

	it("distinguishes unbounded and explicit first-page pagination", async () => {
		for (let i = 0; i < 25; i++) {
			await adapter.create({
				model: "mediaAsset",
				data: makeAsset(i),
			});
		}

		const unbounded = await listAssets(adapter);
		const paginated = await listAssets(adapter, { limit: 20, offset: 0 });

		expect(unbounded.items).toHaveLength(25);
		expect(paginated.items).toHaveLength(20);

		expect(assetListDiscriminator()).not.toEqual(
			assetListDiscriminator({ limit: 20, offset: 0 }),
		);
		expect(MEDIA_QUERY_KEYS.assetsList()).not.toEqual(
			MEDIA_QUERY_KEYS.assetsList({ limit: 20, offset: 0 }),
		);
	});

	it("partitions protected asset and folder queries by identity", () => {
		const first = { id: "user-a", role: "member" };
		const second = { id: "user-b", role: "member" };
		expect(MEDIA_QUERY_KEYS.assetsList({ limit: 40 }, first)).not.toEqual(
			MEDIA_QUERY_KEYS.assetsList({ limit: 40 }, second),
		);
		expect(MEDIA_QUERY_KEYS.foldersList(null, first)).not.toEqual(
			MEDIA_QUERY_KEYS.foldersList(null, "pending:2"),
		);
		expect(MEDIA_QUERY_KEYS.assetsList({ limit: 40 })).toEqual([
			"mediaAssets",
			"list",
			assetListDiscriminator({ limit: 40 }),
		]);
	});
});
