/**
 * Guard the Media resource declaration against client/server key drift and
 * preserve the root-vs-all folder wire semantics used by the folder tree.
 */
import { describe, expect, it, vi } from "vitest";
import {
	MEDIA_QUERY_KEYS,
	assetListDiscriminator,
} from "../plugins/media/api/query-key-defs";
import {
	createMediaQueryKeys,
	mediaResources,
} from "../plugins/media/query-keys";
import { ROOT_FOLDER_QUERY_VALUE } from "../plugins/media/schemas";

const ENDPOINT = {
	baseURL: "https://media.example.com",
	basePath: "/api/data",
};

describe("media resource query keys", () => {
	it("matches the shared asset-list builder and normalizes search", () => {
		const client = vi.fn() as any;
		const queries = createMediaQueryKeys(client);
		const params = { folderId: "photos", query: "  beach  ", limit: 40 };

		expect([
			...queries.mediaAssets.list(params, undefined, ENDPOINT).queryKey,
		]).toEqual([...MEDIA_QUERY_KEYS.assetsList(params, undefined, ENDPOINT)]);
		expect(assetListDiscriminator(params).query).toBe("beach");
	});

	it("aligns SSR/browser keys for the hydrated identity", () => {
		const client = vi.fn() as any;
		const queries = createMediaQueryKeys(client);
		const identity = { id: "member-a", role: "member" };
		const params = { limit: 40 };

		expect(
			queries.mediaAssets.list(params, identity, ENDPOINT).queryKey,
		).toEqual(MEDIA_QUERY_KEYS.assetsList(params, identity, ENDPOINT));
		expect(
			queries.mediaFolders.list(null, identity, ENDPOINT).queryKey,
		).toEqual(MEDIA_QUERY_KEYS.foldersList(null, identity, ENDPOINT));
	});

	it("partitions asset and folder lists by Media origin and mount path", () => {
		const client = vi.fn() as any;
		const queries = createMediaQueryKeys(client);
		const otherOrigin = { ...ENDPOINT, baseURL: "https://other.example.com" };
		const otherPath = { ...ENDPOINT, basePath: "/media-api" };

		for (const endpoint of [otherOrigin, otherPath]) {
			expect(
				queries.mediaAssets.list({}, undefined, ENDPOINT).queryKey,
			).not.toEqual(queries.mediaAssets.list({}, undefined, endpoint).queryKey);
			expect(
				queries.mediaFolders.list(undefined, undefined, ENDPOINT).queryKey,
			).not.toEqual(
				queries.mediaFolders.list(undefined, undefined, endpoint).queryKey,
			);
		}
		expect(
			JSON.stringify(
				queries.mediaAssets.list({}, undefined, ENDPOINT).queryKey,
			),
		).toBe(
			JSON.stringify(MEDIA_QUERY_KEYS.assetsList({}, undefined, ENDPOINT)),
		);
		const noisyEndpoint = {
			...ENDPOINT,
			headers: { authorization: "Bearer server-secret" },
			credentials: "include",
		};
		const serializedKey = JSON.stringify(
			MEDIA_QUERY_KEYS.assetsList({}, undefined, noisyEndpoint),
		);
		expect(serializedKey).not.toContain("server-secret");
		expect(serializedKey).not.toContain("credentials");
	});

	it("uses distinct keys for all folders, root folders, and a parent", () => {
		const client = vi.fn() as any;
		const queries = createMediaQueryKeys(client);

		expect([
			...queries.mediaFolders.list(undefined, undefined, ENDPOINT).queryKey,
		]).toEqual([
			...MEDIA_QUERY_KEYS.foldersList(undefined, undefined, ENDPOINT),
		]);
		expect([
			...queries.mediaFolders.list(null, undefined, ENDPOINT).queryKey,
		]).toEqual([...MEDIA_QUERY_KEYS.foldersList(null, undefined, ENDPOINT)]);
		expect(
			queries.mediaFolders.list(undefined, undefined, ENDPOINT).queryKey,
		).not.toEqual(
			queries.mediaFolders.list(null, undefined, ENDPOINT).queryKey,
		);
		expect([
			...queries.mediaFolders.list("parent-1", undefined, ENDPOINT).queryKey,
		]).toEqual(MEDIA_QUERY_KEYS.foldersList("parent-1", undefined, ENDPOINT));
	});

	it("sends the root sentinel only for an explicit null parent", async () => {
		const client = vi.fn().mockResolvedValue({ data: [] }) as any;
		const queries = createMediaQueryKeys(client);

		await queries.mediaFolders.list(undefined, undefined, ENDPOINT).queryFn();
		expect(client).toHaveBeenLastCalledWith(
			"/media/folders",
			expect.objectContaining({ query: {} }),
		);

		await queries.mediaFolders.list(null, undefined, ENDPOINT).queryFn();
		expect(client).toHaveBeenLastCalledWith(
			"/media/folders",
			expect.objectContaining({
				query: { parentId: ROOT_FOLDER_QUERY_VALUE },
			}),
		);
	});

	it("normalizes relative asset URLs in the server-safe query pipeline", async () => {
		const client = vi.fn().mockResolvedValue({
			data: {
				items: [{ url: "/uploads/asset.jpg" }],
				total: 1,
			},
		}) as any;
		const queries = createMediaQueryKeys(client);

		const result = await queries.mediaAssets
			.list({}, undefined, ENDPOINT)
			.queryFn();

		expect(result.items[0]?.url).toBe(
			"https://media.example.com/uploads/asset.jpg",
		);
	});

	it("stops infinite pagination after all rows are loaded", () => {
		const nextPageParam = mediaResources.mediaAssets.queries.list.nextPageParam;
		const first = { items: new Array(20), total: 25 };
		const last = { items: new Array(5), total: 25 };

		expect(nextPageParam(first, [first])).toBe(20);
		expect(nextPageParam(last, [first, last])).toBeUndefined();
	});

	it("preserves the corrected v3 query-key prefixes", () => {
		const client = vi.fn() as any;
		const queries = createMediaQueryKeys(client);

		expect([...queries.mediaAssets._def]).toEqual(["mediaAssets"]);
		expect([...queries.mediaAssets.list._def]).toEqual(["mediaAssets", "list"]);
		expect([...queries.mediaFolders.list._def]).toEqual([
			"mediaFolders",
			"list",
		]);
	});
});
