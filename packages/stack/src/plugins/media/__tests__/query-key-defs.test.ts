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
});
