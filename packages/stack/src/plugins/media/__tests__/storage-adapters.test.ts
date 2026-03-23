import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { VercelBlobHandleUploadBody } from "../api/storage-adapter";

// Top-level vi.mock calls are hoisted by Vitest before any imports.
// Factories are used so the packages do not need to be installed as devDependencies.

const mockSend = vi.fn().mockResolvedValue({});
const mockS3Client = vi.fn(() => ({ send: mockSend }));
const mockPutObjectCommand = vi.fn((input: unknown) => ({
	input,
	__type: "PutObjectCommand",
}));
const mockDeleteObjectCommand = vi.fn((input: unknown) => ({
	input,
	__type: "DeleteObjectCommand",
}));
const mockGetSignedUrl = vi
	.fn()
	.mockResolvedValue("https://s3.example.com/signed-url");

const mockHandleUpload = vi.fn().mockResolvedValue({
	type: "blob.generate-client-token",
	clientToken: "tok123",
});
const mockDel = vi.fn().mockResolvedValue(undefined);

vi.mock("@aws-sdk/client-s3", () => ({
	S3Client: mockS3Client,
	PutObjectCommand: mockPutObjectCommand,
	DeleteObjectCommand: mockDeleteObjectCommand,
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
	getSignedUrl: mockGetSignedUrl,
}));

vi.mock("@vercel/blob/client", () => ({
	handleUpload: mockHandleUpload,
}));

vi.mock("@vercel/blob", () => ({
	del: mockDel,
}));

import { localAdapter } from "../api/adapters/local";

// ── Local adapter ─────────────────────────────────────────────────────────────

describe("localAdapter", () => {
	let tmpDir: string;

	afterEach(async () => {
		if (tmpDir) {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
		vi.clearAllMocks();
	});

	async function makeTmpDir() {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "btst-media-test-"));
		return tmpDir;
	}

	it("uploads a file and returns a public URL", async () => {
		const uploadDir = await makeTmpDir();
		const adapter = localAdapter({ uploadDir, publicPath: "/uploads" });

		const buffer = Buffer.from("hello world");
		const { url } = await adapter.upload(buffer, {
			filename: "test.txt",
			mimeType: "text/plain",
			size: buffer.byteLength,
		});

		expect(url).toMatch(/^\/uploads\/test-[a-f0-9]{16}\.txt$/);

		const storedFilename = url.split("/").pop()!;
		const storedPath = path.join(uploadDir, storedFilename);
		const storedContent = await fs.readFile(storedPath);
		expect(storedContent.toString()).toBe("hello world");
	});

	it("creates the upload directory if it does not exist", async () => {
		const uploadDir = path.join(await makeTmpDir(), "nested", "uploads");
		const adapter = localAdapter({ uploadDir, publicPath: "/uploads" });

		const buffer = Buffer.from("data");
		await adapter.upload(buffer, {
			filename: "file.txt",
			mimeType: "text/plain",
			size: buffer.byteLength,
		});

		const stat = await fs.stat(uploadDir);
		expect(stat.isDirectory()).toBe(true);
	});

	it("generates a unique filename for each upload", async () => {
		const uploadDir = await makeTmpDir();
		const adapter = localAdapter({ uploadDir, publicPath: "/uploads" });

		const buf = Buffer.from("data");
		const options = {
			filename: "same.jpg",
			mimeType: "image/jpeg",
			size: buf.byteLength,
		};
		const { url: url1 } = await adapter.upload(buf, options);
		const { url: url2 } = await adapter.upload(buf, options);

		expect(url1).not.toBe(url2);
	});

	it("deletes a previously uploaded file", async () => {
		const uploadDir = await makeTmpDir();
		const adapter = localAdapter({ uploadDir, publicPath: "/uploads" });

		const buffer = Buffer.from("delete me");
		const { url } = await adapter.upload(buffer, {
			filename: "todelete.txt",
			mimeType: "text/plain",
			size: buffer.byteLength,
		});

		const storedFilename = url.split("/").pop()!;
		const storedPath = path.join(uploadDir, storedFilename);

		await adapter.delete(url);
		await expect(fs.stat(storedPath)).rejects.toThrow();
	});

	it("does not throw when deleting a file that does not exist", async () => {
		const uploadDir = await makeTmpDir();
		const adapter = localAdapter({ uploadDir, publicPath: "/uploads" });

		await expect(
			adapter.delete("/uploads/nonexistent-file.jpg"),
		).resolves.not.toThrow();
	});

	it("uses default uploadDir and publicPath", async () => {
		const adapter = localAdapter();
		expect(adapter.type).toBe("local");
	});
});

// ── S3 adapter ────────────────────────────────────────────────────────────────

describe("s3Adapter", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("generates a presigned PUT URL token", async () => {
		const { s3Adapter } = await import("../api/adapters/s3");
		const adapter = s3Adapter({
			bucket: "my-bucket",
			region: "us-east-1",
			accessKeyId: "ACCESS_KEY",
			secretAccessKey: "SECRET_KEY",
			publicBaseUrl: "https://assets.example.com",
		});

		const token = await adapter.generateUploadToken({
			filename: "photo.jpg",
			mimeType: "image/jpeg",
			size: 4096,
		});

		expect(token.type).toBe("presigned-url");
		expect(token.payload).toMatchObject({
			uploadUrl: "https://s3.example.com/signed-url",
			publicUrl: "https://assets.example.com/photo.jpg",
			key: "photo.jpg",
			method: "PUT",
			headers: { "Content-Type": "image/jpeg" },
		});
		expect(mockPutObjectCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				Bucket: "my-bucket",
				Key: "photo.jpg",
				ContentType: "image/jpeg",
			}),
		);
		expect(mockGetSignedUrl).toHaveBeenCalledWith(
			expect.any(Object),
			expect.any(Object),
			{ expiresIn: 300 },
		);
	});

	it("includes folderId in the S3 key", async () => {
		const { s3Adapter } = await import("../api/adapters/s3");
		const adapter = s3Adapter({
			bucket: "my-bucket",
			region: "us-east-1",
			accessKeyId: "ACCESS_KEY",
			secretAccessKey: "SECRET_KEY",
			publicBaseUrl: "https://assets.example.com",
		});

		const token = await adapter.generateUploadToken({
			filename: "image.png",
			mimeType: "image/png",
			size: 1000,
			folderId: "folder-abc",
		});

		expect((token.payload as Record<string, unknown>).key).toBe(
			"folder-abc/image.png",
		);
		expect((token.payload as Record<string, unknown>).publicUrl).toBe(
			"https://assets.example.com/folder-abc/image.png",
		);
	});

	it("calls DeleteObjectCommand with the correct key when deleting by public URL", async () => {
		const { s3Adapter } = await import("../api/adapters/s3");
		const adapter = s3Adapter({
			bucket: "my-bucket",
			region: "us-east-1",
			accessKeyId: "ACCESS_KEY",
			secretAccessKey: "SECRET_KEY",
			publicBaseUrl: "https://assets.example.com",
		});

		await adapter.delete("https://assets.example.com/photos/cat.jpg");

		expect(mockDeleteObjectCommand).toHaveBeenCalledWith({
			Bucket: "my-bucket",
			Key: "photos/cat.jpg",
		});
		expect(mockSend).toHaveBeenCalled();
	});

	it("respects the custom expiresIn option", async () => {
		const { s3Adapter } = await import("../api/adapters/s3");
		const adapter = s3Adapter({
			bucket: "my-bucket",
			region: "us-east-1",
			accessKeyId: "ACCESS_KEY",
			secretAccessKey: "SECRET_KEY",
			publicBaseUrl: "https://assets.example.com",
			expiresIn: 600,
		});

		await adapter.generateUploadToken({
			filename: "file.jpg",
			mimeType: "image/jpeg",
			size: 100,
		});

		expect(mockGetSignedUrl).toHaveBeenCalledWith(
			expect.any(Object),
			expect.any(Object),
			{ expiresIn: 600 },
		);
	});
});

// ── Vercel Blob adapter ───────────────────────────────────────────────────────

describe("vercelBlobAdapter", () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it("calls handleUpload with the request and body", async () => {
		const { vercelBlobAdapter } = await import("../api/adapters/vercel-blob");
		const adapter = vercelBlobAdapter();

		const body: VercelBlobHandleUploadBody = {
			type: "blob.generate-client-token",
			payload: {
				pathname: "photo.jpg",
				multipart: false,
				clientPayload: null,
			},
		};
		const request = new Request("https://example.com/api/upload", {
			method: "POST",
			body: JSON.stringify(body),
			headers: { "Content-Type": "application/json" },
		});

		const result = await adapter.handleRequest(request, body, {});

		expect(mockHandleUpload).toHaveBeenCalledWith(
			expect.objectContaining({
				body,
				request,
			}),
		);
		expect(result).toEqual({
			type: "blob.generate-client-token",
			clientToken: "tok123",
		});
	});

	it("passes the onBeforeGenerateToken callback to handleUpload", async () => {
		const { vercelBlobAdapter } = await import("../api/adapters/vercel-blob");
		const adapter = vercelBlobAdapter();

		const onBeforeGenerateToken = vi.fn().mockResolvedValue(undefined);
		const body: VercelBlobHandleUploadBody = {
			type: "blob.generate-client-token",
			payload: {
				pathname: "test.jpg",
				multipart: false,
				clientPayload: null,
			},
		};
		const request = new Request("https://example.com/api/upload", {
			method: "POST",
			body: JSON.stringify(body),
			headers: { "Content-Type": "application/json" },
		});

		await adapter.handleRequest(request, body, { onBeforeGenerateToken });

		// Verify that handleUpload received an onBeforeGenerateToken callback
		const callArgs = mockHandleUpload.mock.calls[0]![0] as Record<
			string,
			unknown
		>;
		expect(callArgs.onBeforeGenerateToken).toBeTypeOf("function");

		// Invoke the callback directly to verify it proxies to our hook
		const cb = callArgs.onBeforeGenerateToken as Function;
		await cb("test.jpg", null);
		expect(onBeforeGenerateToken).toHaveBeenCalledWith("test.jpg", null);
	});

	it("reuses the already-parsed request body without reading the request again", async () => {
		const { vercelBlobAdapter } = await import("../api/adapters/vercel-blob");
		const adapter = vercelBlobAdapter();

		const body: VercelBlobHandleUploadBody = {
			type: "blob.generate-client-token",
			payload: {
				pathname: "consumed.jpg",
				multipart: false,
				clientPayload: null,
			},
		};
		const request = new Request("https://example.com/api/upload", {
			method: "POST",
			body: JSON.stringify(body),
			headers: { "Content-Type": "application/json" },
		});

		// Simulate the BTST route layer parsing the request before the adapter runs.
		const parsedBody = await request.json();

		const result = await adapter.handleRequest(request, parsedBody, {});

		expect(mockHandleUpload).toHaveBeenCalledWith(
			expect.objectContaining({
				body: parsedBody,
				request,
			}),
		);
		expect(result).toEqual({
			type: "blob.generate-client-token",
			clientToken: "tok123",
		});
	});

	it("calls del when deleting a blob by URL", async () => {
		const { vercelBlobAdapter } = await import("../api/adapters/vercel-blob");
		const adapter = vercelBlobAdapter();

		await adapter.delete("https://public.blob.vercel-storage.com/photo.jpg");

		expect(mockDel).toHaveBeenCalledWith(
			"https://public.blob.vercel-storage.com/photo.jpg",
			undefined,
		);
	});

	it("passes the token option to del when provided", async () => {
		const { vercelBlobAdapter } = await import("../api/adapters/vercel-blob");
		const adapter = vercelBlobAdapter({ token: "my-custom-token" });

		await adapter.delete("https://public.blob.vercel-storage.com/file.jpg");

		expect(mockDel).toHaveBeenCalledWith(
			"https://public.blob.vercel-storage.com/file.jpg",
			{ token: "my-custom-token" },
		);
	});
});
