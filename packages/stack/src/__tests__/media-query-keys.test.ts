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

describe("media resource query keys", () => {
	it("matches the shared asset-list builder and normalizes search", () => {
		const client = vi.fn() as any;
		const queries = createMediaQueryKeys(client);
		const params = { folderId: "photos", query: "  beach  ", limit: 40 };

		expect([...queries.mediaAssets.list(params).queryKey]).toEqual([
			...MEDIA_QUERY_KEYS.assetsList(params),
		]);
		expect(assetListDiscriminator(params).query).toBe("beach");
	});

	it("aligns SSR/browser keys for the hydrated identity", () => {
		const client = vi.fn() as any;
		const queries = createMediaQueryKeys(client);
		const identity = { id: "member-a", role: "member" };
		const params = { limit: 40 };

		expect(queries.mediaAssets.list(params, identity).queryKey).toEqual(
			MEDIA_QUERY_KEYS.assetsList(params, identity),
		);
		expect(queries.mediaFolders.list(null, identity).queryKey).toEqual(
			MEDIA_QUERY_KEYS.foldersList(null, identity),
		);
	});

	it("uses distinct keys for all folders, root folders, and a parent", () => {
		const client = vi.fn() as any;
		const queries = createMediaQueryKeys(client);

		expect([...queries.mediaFolders.list(undefined).queryKey]).toEqual([
			...MEDIA_QUERY_KEYS.foldersList(undefined),
		]);
		expect([...queries.mediaFolders.list(null).queryKey]).toEqual([
			...MEDIA_QUERY_KEYS.foldersList(null),
		]);
		expect(queries.mediaFolders.list(undefined).queryKey).not.toEqual(
			queries.mediaFolders.list(null).queryKey,
		);
		expect([...queries.mediaFolders.list("parent-1").queryKey]).toEqual([
			"mediaFolders",
			"list",
			"parent-1",
		]);
	});

	it("sends the root sentinel only for an explicit null parent", async () => {
		const client = vi.fn().mockResolvedValue({ data: [] }) as any;
		const queries = createMediaQueryKeys(client);

		await queries.mediaFolders.list(undefined).queryFn();
		expect(client).toHaveBeenLastCalledWith(
			"/media/folders",
			expect.objectContaining({ query: {} }),
		);

		await queries.mediaFolders.list(null).queryFn();
		expect(client).toHaveBeenLastCalledWith(
			"/media/folders",
			expect.objectContaining({
				query: { parentId: ROOT_FOLDER_QUERY_VALUE },
			}),
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
