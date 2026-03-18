import { describe, it, expect, vi } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter as Adapter, DatabaseDefinition } from "@btst/db";
import { stack } from "../../../api";
import { mediaBackendPlugin } from "../api/plugin";
import { localAdapter } from "../api/adapters/local";
import type { S3StorageAdapter } from "../api/storage-adapter";

const testAdapter = (db: DatabaseDefinition): Adapter =>
	createMemoryAdapter(db)({});

function createBackend(overrides?: { allowedUrlPrefixes?: string[] }) {
	return stack({
		basePath: "/api",
		plugins: {
			media: mediaBackendPlugin({
				storageAdapter: localAdapter(),
				...overrides,
			}),
		},
		adapter: testAdapter,
	});
}

function createS3StorageAdapter(urlPrefix = "https://assets.example.com") {
	return {
		type: "s3",
		urlPrefix,
		generateUploadToken: vi.fn(),
		delete: vi.fn(),
	} satisfies S3StorageAdapter;
}

function createS3Backend(config?: {
	storageAdapter?: S3StorageAdapter;
	allowedUrlPrefixes?: string[];
}) {
	return stack({
		basePath: "/api",
		plugins: {
			media: mediaBackendPlugin({
				storageAdapter: config?.storageAdapter ?? createS3StorageAdapter(),
				allowedUrlPrefixes: config?.allowedUrlPrefixes,
			}),
		},
		adapter: testAdapter,
	});
}

const createAssetRequestBody = (url: string) => ({
	filename: "photo.jpg",
	originalName: "Photo.jpg",
	mimeType: "image/jpeg",
	size: 1024,
	url,
});

describe("mediaBackendPlugin create-asset URL validation", () => {
	it("rejects client-supplied URLs when using localAdapter by default", async () => {
		const backend = createBackend();

		const response = await backend.handler(
			new Request("http://localhost/api/media/assets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					createAssetRequestBody("https://evil.example/tracker.jpg"),
				),
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.text()).resolves.toContain(
			"Client-supplied asset URLs are not allowed with localAdapter",
		);

		const assets = await backend.api.media.listAssets();
		expect(assets.items).toHaveLength(0);
	});

	it("allows localAdapter asset creation when trusted URL prefixes are explicitly configured", async () => {
		const backend = createBackend({
			allowedUrlPrefixes: ["https://cdn.example.com/uploads/"],
		});

		const response = await backend.handler(
			new Request("http://localhost/api/media/assets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					createAssetRequestBody("https://cdn.example.com/uploads/photo.jpg"),
				),
			}),
		);

		expect(response.status).toBe(200);

		const assets = await backend.api.media.listAssets();
		expect(assets.items).toHaveLength(1);
		expect(assets.items[0]?.url).toBe(
			"https://cdn.example.com/uploads/photo.jpg",
		);
	});
});

describe("mediaBackendPlugin S3 URL validation", () => {
	it("rejects spoofed domains for explicit allowedUrlPrefixes", async () => {
		const backend = createS3Backend({
			allowedUrlPrefixes: ["https://assets.example.com"],
		});

		const response = await backend.handler(
			new Request("http://localhost/api/media/assets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					createAssetRequestBody(
						"https://assets.example.com.evil.com/payload.jpg",
					),
				),
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.text()).resolves.toContain(
			"URL must start with one of: https://assets.example.com",
		);
	});

	it("rejects spoofed domains for the S3 adapter public URL prefix", async () => {
		const backend = createS3Backend({
			storageAdapter: createS3StorageAdapter("https://assets.example.com"),
		});

		const response = await backend.handler(
			new Request("http://localhost/api/media/assets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					createAssetRequestBody(
						"https://assets.example.com.evil.com/payload.jpg",
					),
				),
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.text()).resolves.toContain(
			"URL must start with the configured S3 publicBaseUrl: https://assets.example.com",
		);
	});

	it("accepts valid asset URLs on the configured prefix boundary", async () => {
		const backend = createS3Backend({
			allowedUrlPrefixes: ["https://assets.example.com/"],
		});

		const response = await backend.handler(
			new Request("http://localhost/api/media/assets", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(
					createAssetRequestBody("https://assets.example.com/folder/photo.jpg"),
				),
			}),
		);

		expect(response.ok).toBe(true);
	});
});
