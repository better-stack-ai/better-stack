import { afterEach, expect, it, vi } from "vitest";
import { createMediaUploadConfig, uploadAsset } from "../client/upload";

vi.mock("@vercel/blob/client", () => ({
	put: () => {
		throw new Error("Base Media must not load the optional provider SDK");
	},
}));

afterEach(() => vi.unstubAllGlobals());

it("uses the explicitly selected Blob uploader while keeping app credentials on the Media API", async () => {
	const uploadBlob = vi.fn(async () => ({
		url: "https://example.public.blob.vercel-storage.com/photo.jpg",
	}));
	const asset = {
		id: "existing-asset",
		filename: "photo.jpg",
		originalName: "photo.jpg",
		mimeType: "image/jpeg",
		size: 5,
		url: "https://example.public.blob.vercel-storage.com/photo.jpg",
		createdAt: "2026-01-01T00:00:00.000Z",
	};
	const fetch = vi
		.fn()
		.mockResolvedValueOnce(
			Response.json({ clientToken: "scoped-storage-token" }),
		)
		.mockResolvedValueOnce(Response.json(asset));
	vi.stubGlobal("fetch", fetch);
	const config = createMediaUploadConfig(
		{
			api: {
				baseURL: "https://app.example.test",
				basePath: "/api",
				browserHeaders: { authorization: "app-token" },
				credentials: "include",
			},
			config: { uploadMode: "vercel-blob", uploadBlob },
		},
		{ imageCompression: false },
	);
	const file = new File(["photo"], "photo.jpg", { type: "image/jpeg" });
	await expect(uploadAsset(config, { file })).resolves.toEqual(asset);
	expect(uploadBlob).toHaveBeenCalledWith("photo.jpg", file, {
		access: "public",
		token: "scoped-storage-token",
	});
	expect(fetch.mock.calls.map(([url]) => new URL(url).origin)).toEqual([
		"https://app.example.test",
		"https://app.example.test",
	]);
	expect(fetch.mock.calls[0]?.[1].headers.authorization).toBe("app-token");
});
