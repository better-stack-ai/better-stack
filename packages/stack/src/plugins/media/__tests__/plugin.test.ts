import { afterEach, describe, it, expect, vi } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter as Adapter, DatabaseDefinition } from "@btst/db";
import { stack } from "../../../api";
import { mediaBackendPlugin, type MediaBackendConfig } from "../api/plugin";
import { localAdapter } from "../api/adapters/local";
import type {
	DirectStorageAdapter,
	S3StorageAdapter,
	VercelBlobStorageAdapter,
} from "../api/storage-adapter";

type AdapterFactory = (db: DatabaseDefinition) => Adapter;

const testAdapter: AdapterFactory = (db: DatabaseDefinition): Adapter =>
	createMemoryAdapter(db)({});

afterEach(() => {
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

function createBackend(
	config: Partial<MediaBackendConfig> & {
		adapterFactory?: AdapterFactory;
	} = {},
) {
	const { adapterFactory = testAdapter, storageAdapter, ...overrides } = config;

	return stack({
		basePath: "/api",
		plugins: {
			media: mediaBackendPlugin({
				storageAdapter: storageAdapter ?? localAdapter(),
				...overrides,
			}),
		},
		adapter: adapterFactory,
	});
}

function createLocalStorageAdapter(
	overrides: Partial<DirectStorageAdapter> = {},
): DirectStorageAdapter {
	return {
		type: "local",
		upload: vi.fn(async (_buffer, options) => ({
			url: `/uploads/${options.filename}`,
		})),
		delete: vi.fn(async () => undefined),
		...overrides,
	};
}

function createS3StorageAdapter(
	urlPrefix = "https://assets.example.com",
): S3StorageAdapter {
	return {
		type: "s3",
		urlPrefix,
		generateUploadToken: vi.fn(async (options) => {
			const normalizedPrefix = urlPrefix.replace(/\/$/, "");
			const key = options.folderId
				? `${options.folderId}/${options.filename}`
				: options.filename;
			return {
				type: "presigned-url" as const,
				payload: {
					uploadUrl: "https://s3.example.com/upload",
					publicUrl: `${normalizedPrefix}/${key}`,
					key,
					method: "PUT" as const,
					headers: { "Content-Type": options.mimeType },
				},
			};
		}),
		delete: vi.fn(async () => undefined),
	} satisfies S3StorageAdapter;
}

function createVercelBlobStorageAdapter(
	overrides: Partial<VercelBlobStorageAdapter> = {},
): VercelBlobStorageAdapter {
	return {
		type: "vercel-blob",
		urlHostnameSuffix: ".public.blob.vercel-storage.com",
		handleRequest: vi.fn(async (request, callbacks) => {
			const body = (await request.json()) as {
				pathname?: string;
				clientPayload?: string | null;
			};
			const tokenOptions = await callbacks.onBeforeGenerateToken?.(
				body.pathname ?? "photo.jpg",
				body.clientPayload ?? null,
			);
			return { ok: true, tokenOptions };
		}),
		delete: vi.fn(async () => undefined),
		...overrides,
	};
}

function createS3Backend(
	config: Omit<Partial<MediaBackendConfig>, "storageAdapter"> & {
		storageAdapter?: S3StorageAdapter;
		adapterFactory?: AdapterFactory;
	} = {},
) {
	return createBackend({
		storageAdapter: config.storageAdapter ?? createS3StorageAdapter(),
		allowedUrlPrefixes: config.allowedUrlPrefixes,
		hooks: config.hooks,
		maxFileSizeBytes: config.maxFileSizeBytes,
		allowedMimeTypes: config.allowedMimeTypes,
		adapterFactory: config.adapterFactory,
	});
}

function createVercelBlobBackend(
	config: Omit<Partial<MediaBackendConfig>, "storageAdapter"> & {
		storageAdapter?: VercelBlobStorageAdapter;
		adapterFactory?: AdapterFactory;
	} = {},
) {
	return createBackend({
		storageAdapter: config.storageAdapter ?? createVercelBlobStorageAdapter(),
		allowedUrlPrefixes: config.allowedUrlPrefixes,
		hooks: config.hooks,
		maxFileSizeBytes: config.maxFileSizeBytes,
		allowedMimeTypes: config.allowedMimeTypes,
		adapterFactory: config.adapterFactory,
	});
}

const createAssetRequestBody = (url: string) => ({
	filename: "photo.jpg",
	originalName: "Photo.jpg",
	mimeType: "image/jpeg",
	size: 1024,
	url,
});

function createJsonRequest(
	path: string,
	method: string,
	body?: unknown,
): Request {
	return new Request(`http://localhost${path}`, {
		method,
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
}

function createUploadRequest(options?: {
	fileName?: string;
	mimeType?: string;
	content?: string;
	folderId?: string;
}): Request {
	const formData = new FormData();
	formData.set(
		"file",
		new File(
			[options?.content ?? "hello world"],
			options?.fileName ?? "photo.jpg",
			{
				type: options?.mimeType ?? "image/jpeg",
			},
		),
	);

	if (options?.folderId) {
		formData.set("folderId", options.folderId);
	}

	return new Request("http://localhost/api/media/upload", {
		method: "POST",
		body: formData,
	});
}

async function createFolderViaApi(
	backend: ReturnType<typeof createBackend>,
	input: { name: string; parentId?: string },
) {
	const response = await backend.handler(
		createJsonRequest("/api/media/folders", "POST", input),
	);

	expect(response.ok).toBe(true);
	return (await response.json()) as {
		id: string;
		name: string;
		parentId?: string;
	};
}

async function createAssetViaApi(
	backend: ReturnType<typeof createBackend>,
	input: ReturnType<typeof createAssetRequestBody> & {
		folderId?: string;
		alt?: string;
	},
) {
	const response = await backend.handler(
		createJsonRequest("/api/media/assets", "POST", input),
	);

	expect(response.ok).toBe(true);
	return (await response.json()) as {
		id: string;
		folderId?: string;
		alt?: string;
	};
}

async function parseRequestBody(
	request: Request,
): Promise<Record<string, unknown> | undefined> {
	const contentType = request.headers.get("content-type") ?? "";
	if (contentType.includes("multipart/form-data")) {
		const formData = await request.formData();
		const body: Record<string, unknown> = {};
		formData.forEach((value, key) => {
			body[key] = value;
		});
		return body;
	}
	return undefined;
}

async function invokeEndpoint(
	backend: ReturnType<typeof createBackend>,
	endpointKey: string,
	request: Request,
) {
	const body = await parseRequestBody(request);
	return (backend.router as any).endpoints[endpointKey]({
		request,
		headers: request.headers,
		method: request.method,
		params: {},
		query: {},
		body,
		asResponse: true,
	});
}

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

describe("mediaBackendPlugin direct upload", () => {
	it("uploads a file, creates an asset record, and associates it with a folder", async () => {
		const storageAdapter = createLocalStorageAdapter({
			upload: vi.fn(async () => ({ url: "/uploads/photo-123.jpg" })),
		});
		const backend = createBackend({ storageAdapter });
		const folder = await createFolderViaApi(backend, { name: "Photos" });

		const response = await invokeEndpoint(
			backend,
			"media_uploadDirect",
			createUploadRequest({ fileName: "photo.jpg", folderId: folder.id }),
		);

		expect(response.ok).toBe(true);
		expect(storageAdapter.upload).toHaveBeenCalledWith(
			expect.any(Buffer),
			expect.objectContaining({
				filename: "photo.jpg",
				mimeType: "image/jpeg",
				folderId: folder.id,
			}),
		);

		const asset = (await response.json()) as {
			filename: string;
			originalName: string;
			url: string;
			folderId?: string;
		};
		expect(asset.filename).toBe("photo-123.jpg");
		expect(asset.originalName).toBe("photo.jpg");
		expect(asset.url).toBe("/uploads/photo-123.jpg");
		expect(asset.folderId).toBe(folder.id);

		const assets = await backend.api.media.listAssets({ folderId: folder.id });
		expect(assets.items).toHaveLength(1);
		expect(assets.items[0]?.url).toBe("/uploads/photo-123.jpg");
	});

	it("cleans up the uploaded file if creating the DB record fails", async () => {
		const storageAdapter = createLocalStorageAdapter({
			upload: vi.fn(async () => ({ url: "/uploads/will-be-rolled-back.jpg" })),
		});
		const failingAdapterFactory: AdapterFactory = (db) => {
			const adapter = testAdapter(db);
			return {
				...adapter,
				create: async (args) => {
					if (args.model === "mediaAsset") {
						throw new Error("DB write failed");
					}
					return adapter.create(args);
				},
			} as Adapter;
		};
		const backend = createBackend({
			storageAdapter,
			adapterFactory: failingAdapterFactory,
		});

		await expect(
			invokeEndpoint(backend, "media_uploadDirect", createUploadRequest()),
		).rejects.toThrow("DB write failed");
		expect(storageAdapter.delete).toHaveBeenCalledWith(
			"/uploads/will-be-rolled-back.jpg",
		);

		const assets = await backend.api.media.listAssets();
		expect(assets.items).toHaveLength(0);
	});
});

describe("mediaBackendPlugin asset deletion", () => {
	it("returns 500 and keeps the DB record when storage deletion fails", async () => {
		const storageAdapter = createLocalStorageAdapter({
			delete: vi.fn(async () => {
				throw new Error("storage unavailable");
			}),
		});
		const backend = createBackend({
			storageAdapter,
			allowedUrlPrefixes: ["https://cdn.example.com/uploads/"],
		});
		const asset = await createAssetViaApi(backend, {
			...createAssetRequestBody("https://cdn.example.com/uploads/photo.jpg"),
		});

		const response = await backend.handler(
			createJsonRequest(`/api/media/assets/${asset.id}`, "DELETE"),
		);

		expect(response.status).toBe(500);
		await expect(response.text()).resolves.toContain(
			"Failed to delete file from storage",
		);

		const assets = await backend.api.media.listAssets();
		expect(assets.items).toHaveLength(1);
		expect(assets.items[0]?.id).toBe(asset.id);
	});
});

describe("mediaBackendPlugin asset update route", () => {
	it("updates an asset and calls onBeforeUpdateAsset", async () => {
		const onBeforeUpdateAsset = vi.fn();
		const backend = createBackend({
			allowedUrlPrefixes: ["https://cdn.example.com/uploads/"],
			hooks: { onBeforeUpdateAsset },
		});
		const asset = await createAssetViaApi(backend, {
			...createAssetRequestBody("https://cdn.example.com/uploads/photo.jpg"),
			alt: "Before",
		});
		const folder = await createFolderViaApi(backend, { name: "Edited" });

		const response = await backend.handler(
			createJsonRequest(`/api/media/assets/${asset.id}`, "PATCH", {
				alt: "After",
				folderId: folder.id,
			}),
		);

		expect(response.ok).toBe(true);
		expect(onBeforeUpdateAsset).toHaveBeenCalledWith(
			expect.objectContaining({ id: asset.id }),
			{ alt: "After", folderId: folder.id },
			expect.objectContaining({
				body: { alt: "After", folderId: folder.id },
				params: { id: asset.id },
			}),
		);

		const updated = (await response.json()) as {
			alt?: string;
			folderId?: string;
		};
		expect(updated.alt).toBe("After");
		expect(updated.folderId).toBe(folder.id);
	});

	it("returns 404 when updating a missing asset", async () => {
		const backend = createBackend();

		const response = await backend.handler(
			createJsonRequest("/api/media/assets/missing-id", "PATCH", {
				alt: "Nope",
			}),
		);

		expect(response.status).toBe(404);
		await expect(response.text()).resolves.toContain("Asset not found");
	});
});

describe("mediaBackendPlugin S3 upload token route", () => {
	it("sanitizes the S3 key segment and validates the folder", async () => {
		const storageAdapter = createS3StorageAdapter();
		const backend = createS3Backend({ storageAdapter });
		const folder = await createFolderViaApi(backend, { name: "Uploads" });

		const response = await backend.handler(
			createJsonRequest("/api/media/upload/token", "POST", {
				filename: "../photo.png",
				mimeType: "image/png",
				size: 2048,
				folderId: folder.id,
			}),
		);

		expect(response.ok).toBe(true);
		expect(storageAdapter.generateUploadToken).toHaveBeenCalledWith({
			filename: "_-photo.png",
			mimeType: "image/png",
			size: 2048,
			folderId: folder.id,
		});

		const token = (await response.json()) as {
			payload: { key: string; publicUrl: string };
		};
		expect(token.payload.key).toBe(`${folder.id}/_-photo.png`);
		expect(token.payload.publicUrl).toContain(`${folder.id}/_-photo.png`);
	});

	it("returns 404 when the requested folder does not exist", async () => {
		const storageAdapter = createS3StorageAdapter();
		const backend = createS3Backend({ storageAdapter });

		const response = await backend.handler(
			createJsonRequest("/api/media/upload/token", "POST", {
				filename: "photo.png",
				mimeType: "image/png",
				size: 2048,
				folderId: "missing-folder",
			}),
		);

		expect(response.status).toBe(404);
		await expect(response.text()).resolves.toContain("Folder not found");
		expect(storageAdapter.generateUploadToken).not.toHaveBeenCalled();
	});
});

describe("mediaBackendPlugin Vercel Blob route", () => {
	it("passes token constraints through to the adapter callback", async () => {
		const storageAdapter = createVercelBlobStorageAdapter();
		const backend = createVercelBlobBackend({
			storageAdapter,
			allowedMimeTypes: ["image/png"],
			maxFileSizeBytes: 4096,
		});

		const response = await invokeEndpoint(
			backend,
			"media_uploadVercelBlob",
			createJsonRequest("/api/media/upload/vercel-blob", "POST", {
				pathname: "folder/photo.png",
				clientPayload: JSON.stringify({
					mimeType: "image/png",
					size: 512,
				}),
			}),
		);

		expect(response.ok).toBe(true);
		expect(storageAdapter.handleRequest).toHaveBeenCalledTimes(1);

		const body = (await response.json()) as {
			tokenOptions: {
				addRandomSuffix: boolean;
				allowedContentTypes?: string[];
				maximumSizeInBytes?: number;
			};
		};
		expect(body.tokenOptions).toEqual({
			addRandomSuffix: true,
			allowedContentTypes: ["image/png"],
			maximumSizeInBytes: 4096,
		});
	});

	it("falls back safely when clientPayload is invalid JSON", async () => {
		const onBeforeUpload = vi.fn();
		const storageAdapter = createVercelBlobStorageAdapter();
		const backend = createVercelBlobBackend({
			storageAdapter,
			hooks: { onBeforeUpload },
			maxFileSizeBytes: 1024,
		});

		const response = await invokeEndpoint(
			backend,
			"media_uploadVercelBlob",
			createJsonRequest("/api/media/upload/vercel-blob", "POST", {
				pathname: "folder/photo.png",
				clientPayload: "{not json",
			}),
		);

		expect(response.ok).toBe(true);
		expect(onBeforeUpload).toHaveBeenCalledWith(
			{
				filename: "photo.png",
				mimeType: "application/octet-stream",
				size: undefined,
			},
			expect.objectContaining({
				headers: expect.any(Headers),
			}),
		);
	});
});

describe("mediaBackendPlugin hook denial behavior", () => {
	it("maps thrown hook errors to a 403 response", async () => {
		const backend = createBackend({
			hooks: {
				onBeforeCreateFolder: () => {
					throw new Error("No folders for you");
				},
			},
		});

		const response = await backend.handler(
			createJsonRequest("/api/media/folders", "POST", {
				name: "Denied",
			}),
		);

		expect(response.status).toBe(403);
		await expect(response.text()).resolves.toContain("No folders for you");
	});

	it("still denies access for old-style hooks that return false", async () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const backend = createBackend({
			hooks: {
				onBeforeListAssets: (() => false) as unknown as NonNullable<
					NonNullable<MediaBackendConfig["hooks"]>["onBeforeListAssets"]
				>,
			},
		});

		const response = await backend.handler(
			createJsonRequest("/api/media/assets", "GET"),
		);

		expect(response.status).toBe(403);
		await expect(response.text()).resolves.toContain(
			"Unauthorized: Cannot list assets",
		);
		expect(warnSpy).toHaveBeenCalled();
	});
});

describe("mediaBackendPlugin folder deletion route", () => {
	it("returns 409 when a descendant folder contains assets", async () => {
		const backend = createBackend({
			allowedUrlPrefixes: ["https://cdn.example.com/uploads/"],
		});
		const parent = await createFolderViaApi(backend, { name: "Parent" });
		const child = await createFolderViaApi(backend, {
			name: "Child",
			parentId: parent.id,
		});

		await createAssetViaApi(backend, {
			...createAssetRequestBody("https://cdn.example.com/uploads/photo.jpg"),
			folderId: child.id,
		});

		const response = await backend.handler(
			createJsonRequest(`/api/media/folders/${parent.id}`, "DELETE"),
		);

		expect(response.status).toBe(409);
		await expect(response.text()).resolves.toContain("Cannot delete folder");

		const folders = await backend.api.media.listFolders();
		expect(folders.some((folder) => folder.id === parent.id)).toBe(true);
		expect(folders.some((folder) => folder.id === child.id)).toBe(true);
	});
});

describe("mediaBackendPlugin adapter-specific endpoint gating", () => {
	it("rejects direct uploads when using the S3 adapter", async () => {
		const backend = createS3Backend();

		const response = await backend.handler(createUploadRequest());

		expect(response.status).toBe(400);
		await expect(response.text()).resolves.toContain(
			"Direct upload is only supported with the local storage adapter",
		);
	});

	it("rejects upload token requests when using the local adapter", async () => {
		const backend = createBackend();

		const response = await backend.handler(
			createJsonRequest("/api/media/upload/token", "POST", {
				filename: "photo.jpg",
				mimeType: "image/jpeg",
				size: 1024,
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.text()).resolves.toContain(
			"Upload token endpoint is only supported with the S3 storage adapter",
		);
	});

	it("rejects Vercel Blob requests when using the local adapter", async () => {
		const backend = createBackend();

		const response = await backend.handler(
			createJsonRequest("/api/media/upload/vercel-blob", "POST", {
				pathname: "photo.jpg",
			}),
		);

		expect(response.status).toBe(400);
		await expect(response.text()).resolves.toContain(
			"Vercel Blob endpoint is only supported with the vercelBlobAdapter",
		);
	});
});
