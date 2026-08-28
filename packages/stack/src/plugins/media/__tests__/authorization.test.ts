import { createMemoryAdapter } from "@btst/adapter-memory";
import { type DatabaseDefinition, type DBAdapter, defineDb } from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { stack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import type { StackServerAuthProvider } from "../../../shared/auth-types";
import {
	MEDIA_QUERY_KEYS,
	mediaBackendPlugin,
	type MediaBackendHooks,
} from "../api";
import type {
	DirectStorageAdapter,
	S3StorageAdapter,
	VercelBlobStorageAdapter,
} from "../api/storage-adapter";
import { mediaPermissions } from "../permissions";
import type { Asset, Folder } from "../types";

const memoryAdapter = (db: DatabaseDefinition) => createMemoryAdapter(db)({});

const identitySchema = z.object({
	id: z.string(),
	role: z.enum(["member", "admin"]),
	tenantIds: z.array(z.string()),
});

const authorization = defineAuthorization({
	identity: identitySchema,
	permissions: [mediaPermissions] as const,
	rules: ({ media }) => {
		const belongsToTenant = ({
			identity,
			facts,
		}: {
			identity: Identity | null;
			facts: { tenantId?: string };
		}) =>
			identity?.role === "admin" ||
			Boolean(
				identity &&
					(!facts.tenantId || identity.tenantIds.includes(facts.tenantId)),
			);
		return [
			media.library.read.when(({ identity }) => identity !== null),
			media.asset.read.when(belongsToTenant),
			media.asset.upload.when(
				({ identity, facts }) =>
					facts.phase === "callback" || belongsToTenant({ identity, facts }),
			),
			media.asset.update.when(belongsToTenant),
			media.asset.delete.when(belongsToTenant),
			media.folder.create.when(belongsToTenant),
			media.folder.delete.when(belongsToTenant),
		];
	},
});

type Identity = {
	id: string;
	role: "member" | "admin";
	tenantIds: string[];
};

const tenantMember = {
	id: "member-a",
	role: "member",
	tenantIds: ["tenant-a"],
} as const satisfies Identity;
const outsider = {
	id: "member-b",
	role: "member",
	tenantIds: ["tenant-b"],
} as const satisfies Identity;
const admin = {
	id: "admin",
	role: "admin",
	tenantIds: [],
} as const satisfies Identity;

function identityFromRequest(request: Request): Identity | null {
	const id = request.headers.get("x-user-id");
	const role = request.headers.get("x-user-role");
	if (!id || (role !== "member" && role !== "admin")) return null;
	return {
		id,
		role,
		tenantIds:
			request.headers.get("x-tenant-ids")?.split(",").filter(Boolean) ?? [],
	};
}

function createAuth(
	getIdentity: (
		request: Request,
	) => Identity | null | Promise<Identity | null> = identityFromRequest,
	definition = authorization,
) {
	return createServerAuth({
		authorization: definition,
		getIdentity: ({ request }) => getIdentity(request),
	});
}

function directStorage(
	overrides: Partial<DirectStorageAdapter> = {},
): DirectStorageAdapter {
	return {
		type: "local",
		upload: vi.fn(async (_buffer, input) => ({
			url: `https://files.example/${input.filename}`,
		})),
		delete: vi.fn(async () => undefined),
		...overrides,
	};
}

function s3Storage(
	overrides: Partial<S3StorageAdapter> = {},
): S3StorageAdapter {
	return {
		type: "s3",
		urlPrefix: "https://files.example",
		generateUploadToken: vi.fn(async (input) => ({
			type: "presigned-url" as const,
			payload: {
				uploadUrl: "https://storage.example/signed-secret",
				publicUrl: `https://files.example/${input.filename}`,
				key: input.filename,
				method: "PUT" as const,
				headers: { "content-type": input.mimeType },
			},
		})),
		delete: vi.fn(async () => undefined),
		...overrides,
	};
}

function vercelStorage(
	overrides: Partial<VercelBlobStorageAdapter> = {},
): VercelBlobStorageAdapter {
	return {
		type: "vercel-blob",
		urlHostnameSuffix: ".public.blob.vercel-storage.com",
		verifyCallback: vi.fn(async (request, body) => {
			if (request.headers.get("x-vercel-signature") !== "valid") {
				throw new Error("Invalid provider signature");
			}
			const context = JSON.parse(body.payload.tokenPayload ?? "null") as {
				pathname?: string;
				mimeType?: string;
				folderId?: string;
				tenantId?: string;
			};
			if (!context.pathname || !context.mimeType) {
				throw new Error("Invalid server-issued upload context");
			}
			return {
				pathname: context.pathname,
				mimeType: context.mimeType,
				...(context.folderId ? { folderId: context.folderId } : {}),
				...(context.tenantId ? { tenantId: context.tenantId } : {}),
			};
		}),
		handleRequest: vi.fn(async (_request, body, callbacks) => {
			if (body.type === "blob.generate-client-token") {
				return {
					type: body.type,
					tokenOptions: await callbacks.onBeforeGenerateToken?.(
						body.payload.pathname,
						body.payload.clientPayload,
					),
				};
			}
			return { type: body.type, response: "ok" };
		}),
		delete: vi.fn(async () => undefined),
		...overrides,
	};
}

function makeBackend(
	options: {
		storage?:
			| DirectStorageAdapter
			| S3StorageAdapter
			| VercelBlobStorageAdapter;
		hooks?: MediaBackendHooks;
		auth?: StackServerAuthProvider;
		adapter?: (db: DatabaseDefinition) => DBAdapter;
		tenantId?: string;
	} = {},
) {
	return stack({
		basePath: "/api",
		plugins: {
			media: mediaBackendPlugin({
				storageAdapter: options.storage ?? directStorage(),
				allowedUrlPrefixes: ["https://files.example/"],
				hooks: options.hooks,
				resolveTenantId: () => options.tenantId,
			}),
		},
		adapter: options.adapter ?? memoryAdapter,
		...(options.auth ? { auth: options.auth } : {}),
	});
}

function request(
	path: string,
	options: { method?: string; identity?: Identity; body?: unknown } = {},
) {
	const headers = new Headers();
	if (options.identity) {
		headers.set("x-user-id", options.identity.id);
		headers.set("x-user-role", options.identity.role);
		headers.set("x-tenant-ids", options.identity.tenantIds.join(","));
	}
	if (options.body !== undefined)
		headers.set("content-type", "application/json");
	return new Request(`http://localhost/api${path}`, {
		method: options.method ?? "GET",
		headers,
		...(options.body !== undefined
			? { body: JSON.stringify(options.body) }
			: {}),
	});
}

function uploadRequest(identity?: Identity) {
	const body = new FormData();
	body.set("file", new File(["photo"], "photo.jpg", { type: "image/jpeg" }));
	const headers = new Headers();
	if (identity) {
		headers.set("x-user-id", identity.id);
		headers.set("x-user-role", identity.role);
		headers.set("x-tenant-ids", identity.tenantIds.join(","));
	}
	return new Request("http://localhost/api/media/upload", {
		method: "POST",
		headers,
		body,
	});
}

async function seedFolder(
	backend: ReturnType<typeof makeBackend>,
	overrides: Partial<Folder> = {},
) {
	const now = new Date("2026-01-01T00:00:00.000Z");
	return backend.adapter.create<Folder>({
		model: "mediaFolder",
		data: {
			name: "Photos",
			tenantId: "tenant-a",
			createdAt: now,
			updatedAt: now,
			...overrides,
		},
	});
}

async function seedAsset(
	backend: ReturnType<typeof makeBackend>,
	overrides: Partial<Asset> = {},
) {
	const now = new Date("2026-01-01T00:00:00.000Z");
	return backend.adapter.create<Asset>({
		model: "mediaAsset",
		data: {
			filename: "photo.jpg",
			originalName: "Photo.jpg",
			mimeType: "image/jpeg",
			size: 5,
			url: "https://files.example/photo.jpg",
			tenantId: "tenant-a",
			createdAt: now,
			updatedAt: now,
			...overrides,
		},
	});
}

describe("Media authorization inventory", () => {
	it("covers every maintained transport behavior with runtime-schema-backed descriptors", () => {
		const plugin = mediaBackendPlugin({ storageAdapter: directStorage() });
		const adapter = createMemoryAdapter(defineDb({}).use(plugin.dbPlugin))({});
		const operations = plugin.operations?.(adapter);
		expect(Object.keys(operations ?? {}).sort()).toEqual([
			"createAsset",
			"createFolder",
			"deleteAsset",
			"deleteFolder",
			"listAssets",
			"listFolders",
			"updateAsset",
			"uploadDirect",
			"uploadToken",
			"uploadVercelBlob",
		]);
		expect(
			Object.fromEntries(
				Object.entries(operations ?? {}).map(([key, operation]) => [
					key,
					operation.permission.id,
				]),
			),
		).toEqual({
			listAssets: "media:library.read",
			createAsset: "media:asset.upload",
			updateAsset: "media:asset.update",
			deleteAsset: "media:asset.delete",
			listFolders: "media:library.read",
			createFolder: "media:folder.create",
			deleteFolder: "media:folder.delete",
			uploadDirect: "media:asset.upload",
			uploadToken: "media:asset.upload",
			uploadVercelBlob: "media:asset.upload",
		});
		expect(mediaPermissions.library.read()).toMatchObject({
			id: "media:library.read",
		});
		expect(
			mediaPermissions.asset.delete({
				assetId: "asset-1",
				mimeType: "image/png",
			}),
		).toMatchObject({ id: "media:asset.delete" });
		expect(() =>
			mediaPermissions.asset.delete({
				assetId: "asset-1",
				// @ts-expect-error MIME type is a required asset fact.
				mimeType: undefined,
			}),
		).toThrow();
	});
});

describe("Media operation-first authorization", () => {
	it("preserves omitted-auth compatibility while retaining validation and hooks", async () => {
		const events: string[] = [];
		const backend = makeBackend({
			tenantId: "tenant-a",
			hooks: {
				onBeforeCreateFolder: (_input, context) => {
					events.push(`before:${context.identity?.id ?? "anonymous"}`);
				},
			},
		});
		const response = await backend.handler(
			request("/media/folders", {
				method: "POST",
				body: { name: "Compatible" },
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ name: "Compatible" });
		expect(events).toEqual(["before:anonymous"]);
		await expect(
			backend.internal.media.createFolder({ name: "" }),
		).rejects.toBeInstanceOf(z.ZodError);
		expect(events).toHaveLength(1);
	});

	it("returns 401/403 before hooks and derives tenant, folder, and asset facts on the server", async () => {
		const facts: unknown[] = [];
		const beforeDelete = vi.fn();
		const backend = makeBackend({
			auth: createAuth(),
			tenantId: "tenant-a",
			hooks: { onBeforeDelete: beforeDelete },
		});
		const folder = await seedFolder(backend);
		const asset = await seedAsset(backend, { folderId: folder.id });

		expect(
			authorization.can(
				mediaPermissions.asset.delete({
					assetId: asset.id,
					folderId: folder.id,
					mimeType: asset.mimeType,
					tenantId: "tenant-b",
				}),
				outsider,
			),
		).toBe(true);
		expect(
			(
				await backend.handler(
					request(`/media/assets/${asset.id}`, { method: "DELETE" }),
				)
			).status,
		).toBe(401);
		expect(
			(
				await backend.handler(
					request(`/media/assets/${asset.id}`, {
						method: "DELETE",
						identity: outsider,
					}),
				)
			).status,
		).toBe(403);
		expect(beforeDelete).not.toHaveBeenCalled();

		const captureAuth: StackServerAuthProvider = {
			getIdentity: async () => tenantMember,
			can: (input) => {
				facts.push(input.params);
				return true;
			},
		};
		const captured = makeBackend({
			auth: captureAuth,
			tenantId: "tenant-a",
		});
		const capturedFolder = await seedFolder(captured);
		const capturedAsset = await seedAsset(captured, {
			folderId: capturedFolder.id,
		});
		await captured.forRequest(request("/authorized")).api.media.updateAsset({
			id: capturedAsset.id,
			data: { alt: "Trusted" },
		});
		expect(facts).toContainEqual(
			expect.objectContaining({
				assetId: capturedAsset.id,
				folderId: capturedFolder.id,
				mimeType: "image/jpeg",
				tenantId: "tenant-a",
			}),
		);
		await expect(
			backend
				.forRequest(request("/member", { identity: tenantMember }))
				.api.media.updateAsset({ id: asset.id, data: { alt: "Allowed" } }),
		).resolves.toMatchObject({ alt: "Allowed" });
		const adminBackend = makeBackend({
			auth: createAuth(),
			tenantId: "tenant-a",
		});
		const adminAsset = await seedAsset(adminBackend);
		await expect(
			adminBackend
				.forRequest(request("/admin", { identity: admin }))
				.api.media.deleteAsset({ id: adminAsset.id }),
		).resolves.toEqual({ success: true });
	});

	it("fails closed across the maintained anonymous HTTP inventory", async () => {
		const direct = makeBackend({ auth: createAuth(), tenantId: "tenant-a" });
		const folder = await seedFolder(direct);
		const asset = await seedAsset(direct, { folderId: folder.id });
		const directRequests = [
			request("/media/assets"),
			request("/media/assets", {
				method: "POST",
				body: {
					filename: "new.jpg",
					originalName: "new.jpg",
					mimeType: "image/jpeg",
					size: 5,
					url: "https://files.example/new.jpg",
				},
			}),
			request(`/media/assets/${asset.id}`, {
				method: "PATCH",
				body: { alt: "Denied" },
			}),
			request(`/media/assets/${asset.id}`, { method: "DELETE" }),
			request("/media/folders"),
			request("/media/folders", {
				method: "POST",
				body: { name: "Denied" },
			}),
			request(`/media/folders/${folder.id}`, { method: "DELETE" }),
			uploadRequest(),
		];
		for (const protectedRequest of directRequests) {
			expect((await direct.handler(protectedRequest)).status).toBe(401);
		}

		const s3 = makeBackend({
			auth: createAuth(),
			storage: s3Storage(),
			tenantId: "tenant-a",
		});
		expect(
			(
				await s3.handler(
					request("/media/upload/token", {
						method: "POST",
						body: {
							filename: "secret.jpg",
							mimeType: "image/jpeg",
							size: 5,
						},
					}),
				)
			).status,
		).toBe(401);

		const blob = makeBackend({
			auth: createAuth(),
			storage: vercelStorage(),
			tenantId: "tenant-a",
		});
		expect(
			(
				await blob.handler(
					request("/media/upload/vercel-blob", {
						method: "POST",
						body: {
							type: "blob.generate-client-token",
							payload: {
								pathname: "secret.jpg",
								multipart: false,
								clientPayload: JSON.stringify({ mimeType: "image/jpeg" }),
							},
						},
					}),
				)
			).status,
		).toBe(401);
	});

	it("keeps HTTP, forRequest, and internal on one validated lifecycle", async () => {
		const events: string[] = [];
		const getIdentity = vi.fn(() => tenantMember);
		const backend = makeBackend({
			auth: createAuth(getIdentity),
			tenantId: "tenant-a",
			hooks: {
				onBeforeCreateFolder: (_input, context) => {
					events.push(context.identity?.id ?? "internal");
				},
			},
		});
		expect(
			(
				await backend.handler(
					request("/media/folders", {
						method: "POST",
						identity: tenantMember,
						body: { name: "HTTP" },
					}),
				)
			).status,
		).toBe(200);
		await backend
			.forRequest(request("/request", { identity: tenantMember }))
			.api.media.createFolder({ name: "Request" });
		await backend.internal.media.createFolder({ name: "Internal" });
		await expect(
			backend.internal.media.createFolder({ name: "" }),
		).rejects.toBeInstanceOf(z.ZodError);
		expect(events).toEqual([tenantMember.id, tenantMember.id, "internal"]);
		expect(getIdentity).toHaveBeenCalledTimes(2);
	});

	it("preserves missing-rule, rule, identity, and fact failures before hooks", async () => {
		const before = vi.fn();
		const missing = defineAuthorization({
			identity: identitySchema,
			permissions: [mediaPermissions] as const,
			rules: ({ media }) => [media.library.read.allow()],
		});
		const missingBackend = makeBackend({
			auth: createAuth(identityFromRequest, missing),
			tenantId: "tenant-a",
			hooks: { onBeforeUpdateAsset: before },
		});
		const missingAsset = await seedAsset(missingBackend);
		await expect(
			missingBackend
				.forRequest(request("/missing", { identity: tenantMember }))
				.api.media.updateAsset({
					id: missingAsset.id,
					data: { alt: "Denied" },
				}),
		).rejects.toMatchObject({ statusCode: 403 });

		const identityBackend = makeBackend({
			auth: createAuth(() => {
				throw new Error("session unavailable");
			}),
			tenantId: "tenant-a",
			hooks: { onBeforeUpdateAsset: before },
		});
		const identityAsset = await seedAsset(identityBackend);
		await expect(
			identityBackend.forRequest(request("/identity")).api.media.updateAsset({
				id: identityAsset.id,
				data: { alt: "Denied" },
			}),
		).rejects.toThrow("session unavailable");

		const failingRule = defineAuthorization({
			identity: identitySchema,
			permissions: [mediaPermissions] as const,
			rules: ({ media }) => [
				media.asset.update.when(() => {
					throw new Error("policy unavailable");
				}),
			],
		});
		const ruleBackend = makeBackend({
			auth: createAuth(identityFromRequest, failingRule),
			tenantId: "tenant-a",
			hooks: { onBeforeUpdateAsset: before },
		});
		const ruleAsset = await seedAsset(ruleBackend);
		await expect(
			ruleBackend
				.forRequest(request("/rule", { identity: tenantMember }))
				.api.media.updateAsset({
					id: ruleAsset.id,
					data: { alt: "Denied" },
				}),
		).rejects.toThrow("policy unavailable");

		const factBackend = makeBackend({
			auth: createAuth(),
			tenantId: "tenant-a",
			hooks: { onBeforeUpdateAsset: before },
		});
		const factAsset = await seedAsset(factBackend);
		vi.spyOn(factBackend.adapter, "findOne").mockRejectedValueOnce(
			new Error("database unavailable"),
		);
		await expect(
			factBackend
				.forRequest(request("/facts", { identity: tenantMember }))
				.api.media.updateAsset({
					id: factAsset.id,
					data: { alt: "Denied" },
				}),
		).rejects.toThrow("database unavailable");
		expect(before).not.toHaveBeenCalled();
	});

	it("rejects stale and competing asset facts before hooks while preserving the winner", async () => {
		const events: string[] = [];
		let backend: ReturnType<typeof makeBackend>;
		let raced = false;
		backend = makeBackend({
			tenantId: "tenant-a",
			auth: createAuth(async () => {
				if (!raced) {
					raced = true;
					const current = await backend.adapter.findOne<Asset>({
						model: "mediaAsset",
						where: [{ field: "filename", value: "race.jpg" }],
					});
					if (current) {
						await backend.adapter.update<Asset>({
							model: "mediaAsset",
							where: [{ field: "id", value: current.id }],
							update: {
								alt: "Winner",
								updatedAt: new Date("2026-02-01T00:00:00.000Z"),
							},
						});
					}
				}
				return tenantMember;
			}),
			hooks: {
				onBeforeUpdateAsset: () => {
					events.push("hook");
				},
			},
		});
		const asset = await seedAsset(backend, { filename: "race.jpg" });
		await expect(
			backend
				.forRequest(request("/race", { identity: tenantMember }))
				.api.media.updateAsset({ id: asset.id, data: { alt: "Loser" } }),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "MEDIA_STATE_CHANGED",
		});
		expect(events).toEqual([]);
		expect(
			await backend.adapter.findOne<Asset>({
				model: "mediaAsset",
				where: [{ field: "id", value: asset.id }],
			}),
		).toMatchObject({ alt: "Winner" });

		const concurrent = makeBackend({
			tenantId: "tenant-a",
			auth: createAuth(),
			hooks: {
				onBeforeUpdateAsset: () => {
					events.push("winner-hook");
				},
			},
		});
		const concurrentAsset = await seedAsset(concurrent);
		const api = concurrent.forRequest(
			request("/concurrent", { identity: tenantMember }),
		).api.media;
		const settled = await Promise.allSettled([
			api.updateAsset({ id: concurrentAsset.id, data: { alt: "First" } }),
			api.updateAsset({ id: concurrentAsset.id, data: { alt: "Second" } }),
		]);
		expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(
			1,
		);
		expect(settled.filter(({ status }) => status === "rejected")).toHaveLength(
			1,
		);
		expect(events.filter((event) => event === "winner-hook")).toHaveLength(1);
	});

	it("keeps published memory rows created before the version field usable", async () => {
		const backend = makeBackend({
			auth: createAuth(),
			tenantId: "tenant-a",
		});
		const legacy = await backend.adapter.create<Asset>({
			model: "mediaAsset",
			data: {
				filename: "legacy.jpg",
				originalName: "legacy.jpg",
				mimeType: "image/jpeg",
				size: 5,
				url: "https://files.example/legacy.jpg",
				tenantId: "tenant-a",
				createdAt: new Date("2025-01-01T00:00:00.000Z"),
			},
		});
		await backend.adapter.update<Asset>({
			model: "mediaAsset",
			where: [{ field: "id", value: legacy.id }],
			update: { updatedAt: undefined },
		});
		await expect(
			backend
				.forRequest(request("/legacy", { identity: tenantMember }))
				.api.media.updateAsset({ id: legacy.id, data: { alt: "Still works" } }),
		).resolves.toMatchObject({ alt: "Still works" });
	});

	it("rejects stale upload initialization and finalization before hooks, tokens, or writes", async () => {
		const storage = s3Storage();
		const hook = vi.fn();
		let backend: ReturnType<typeof makeBackend>;
		let folderId = "";
		let racePhase: "initialize" | "finalize" | undefined;
		const getIdentity = async () => {
			if (racePhase) {
				await backend.adapter.update<Folder>({
					model: "mediaFolder",
					where: [{ field: "id", value: folderId }],
					update: {
						name: `${racePhase} winner`,
						updatedAt: new Date(
							racePhase === "initialize"
								? "2026-02-01T00:00:00.000Z"
								: "2026-03-01T00:00:00.000Z",
						),
					},
				});
				racePhase = undefined;
			}
			return tenantMember;
		};
		backend = makeBackend({
			auth: createAuth(getIdentity),
			storage,
			tenantId: "tenant-a",
			hooks: { onBeforeUpload: hook },
		});
		folderId = (await seedFolder(backend)).id;
		const api = backend.forRequest(
			request("/upload-race", { identity: tenantMember }),
		).api.media;

		racePhase = "initialize";
		await expect(
			api.uploadToken({
				filename: "race.jpg",
				mimeType: "image/jpeg",
				size: 5,
				folderId,
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "MEDIA_STATE_CHANGED",
		});
		expect(storage.generateUploadToken).not.toHaveBeenCalled();
		expect(hook).not.toHaveBeenCalled();

		racePhase = "finalize";
		const finalizeApi = backend.forRequest(
			request("/finalize-race", { identity: tenantMember }),
		).api.media;
		await expect(
			finalizeApi.createAsset({
				filename: "race.jpg",
				originalName: "race.jpg",
				mimeType: "image/jpeg",
				size: 5,
				url: "https://files.example/race.jpg",
				folderId,
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			code: "MEDIA_STATE_CHANGED",
		});
		expect(hook).not.toHaveBeenCalled();
		expect(await backend.adapter.count({ model: "mediaAsset" })).toBe(0);
	});

	it("serializes memory rollback so rejected uploads cannot erase later raw or API winners", async () => {
		let startRejected = () => {};
		const rejectedStarted = new Promise<void>((resolve) => {
			startRejected = resolve;
		});
		let releaseRejected = () => {};
		const rejectedGate = new Promise<void>((resolve) => {
			releaseRejected = resolve;
		});
		const backend = makeBackend({
			auth: createAuth(),
			tenantId: "tenant-a",
			hooks: {
				onBeforeCreateFolder: async (input) => {
					if (input.name !== "Rejected") return;
					startRejected();
					await rejectedGate;
					throw new Error("workflow rejected");
				},
			},
		});
		const api = backend.forRequest(request("/race", { identity: tenantMember }))
			.api.media;
		const rejected = api.createFolder({ name: "Rejected" });
		await rejectedStarted;
		const now = new Date();
		const rawWinner = backend.adapter.create<Folder>({
			model: "mediaFolder",
			data: {
				name: "Raw winner",
				tenantId: "tenant-a",
				createdAt: now,
				updatedAt: now,
			},
		});
		const apiWinner = api.createFolder({ name: "API winner" });
		releaseRejected();
		await expect(rejected).rejects.toMatchObject({
			statusCode: 403,
			code: "CREATE_FOLDER_REJECTED",
		});
		await expect(rawWinner).resolves.toMatchObject({ name: "Raw winner" });
		await expect(apiWinner).resolves.toMatchObject({ name: "API winner" });
		expect(
			(await backend.adapter.findMany<Folder>({ model: "mediaFolder" })).map(
				({ name }) => name,
			),
		).toEqual(["Raw winner", "API winner"]);
	});

	it("rolls back a caught nested after-hook failure with its memory parent", async () => {
		let backend: ReturnType<typeof makeBackend>;
		const caught: string[] = [];
		backend = makeBackend({
			auth: createAuth(),
			tenantId: "tenant-a",
			hooks: {
				onBeforeCreateFolder: async (input) => {
					if (input.name !== "Outer") return;
					try {
						await backend.internal.media.createAsset({
							filename: "nested.jpg",
							originalName: "nested.jpg",
							mimeType: "image/jpeg",
							size: 5,
							url: "https://files.example/nested.jpg",
						});
					} catch (error) {
						caught.push(error instanceof Error ? error.message : "unknown");
					}
				},
				onAfterUpload: (asset) => {
					if (asset.filename === "nested.jpg") {
						throw new Error("nested after rejected");
					}
				},
			},
		});
		await expect(
			backend
				.forRequest(request("/nested", { identity: tenantMember }))
				.api.media.createFolder({ name: "Outer" }),
		).rejects.toThrow("nested after rejected");
		expect(caught).toEqual(["nested after rejected"]);
		expect(await backend.adapter.count({ model: "mediaAsset" })).toBe(0);
		expect(await backend.adapter.count({ model: "mediaFolder" })).toBe(0);
	}, 1_000);

	it("enforces upload initialization, finalization, and deletion without leaking tokens from collection reads", async () => {
		const storage = s3Storage();
		const events: string[] = [];
		const initializeOnly = defineAuthorization({
			identity: identitySchema,
			permissions: [mediaPermissions] as const,
			rules: ({ media }) => [
				media.library.read.when(({ identity }) => identity !== null),
				media.asset.read.when(({ identity }) => identity !== null),
				media.asset.upload.when(
					({ identity, facts }) =>
						identity !== null && facts.phase === "initialize",
				),
			],
		});
		const backend = makeBackend({
			auth: createAuth(identityFromRequest, initializeOnly),
			storage,
			tenantId: "tenant-a",
			hooks: {
				onBeforeUpload: (_meta, context) => {
					events.push(context.facts.phase);
				},
				onBeforeDelete: () => {
					events.push("delete");
				},
			},
		});
		await seedAsset(backend);
		const list = await backend.handler(
			request("/media/assets", { identity: tenantMember }),
		);
		expect(list.status).toBe(200);
		expect(JSON.stringify(await list.json())).not.toContain("signed-secret");
		expect(storage.generateUploadToken).not.toHaveBeenCalled();
		const token = await backend.handler(
			request("/media/upload/token", {
				method: "POST",
				identity: tenantMember,
				body: {
					filename: "new.jpg",
					mimeType: "image/jpeg",
					size: 5,
				},
			}),
		);
		expect(token.status).toBe(200);
		expect(await token.json()).toMatchObject({
			payload: { uploadUrl: "https://storage.example/signed-secret" },
		});
		const finalize = await backend.handler(
			request("/media/assets", {
				method: "POST",
				identity: tenantMember,
				body: {
					filename: "new.jpg",
					originalName: "new.jpg",
					mimeType: "image/jpeg",
					size: 5,
					url: "https://files.example/new.jpg",
				},
			}),
		);
		expect(finalize.status).toBe(403);
		const existing = await backend.adapter.findOne<Asset>({
			model: "mediaAsset",
			where: [{ field: "filename", value: "photo.jpg" }],
		});
		expect(existing).not.toBeNull();
		const deletion = await backend.handler(
			request(`/media/assets/${existing?.id}`, {
				method: "DELETE",
				identity: tenantMember,
			}),
		);
		expect(deletion.status).toBe(403);
		expect(events).toEqual(["initialize"]);
	});

	it("does not release asset response data under collection-only permission", async () => {
		const collectionOnly = defineAuthorization({
			identity: identitySchema,
			permissions: [mediaPermissions] as const,
			rules: ({ media }) => [media.library.read.allow()],
		});
		const backend = makeBackend({
			auth: createAuth(identityFromRequest, collectionOnly),
			tenantId: "tenant-a",
		});
		await seedAsset(backend, {
			filename: "protected.jpg",
			url: "https://files.example/protected.jpg",
		});
		const response = await backend.handler(
			request("/media/assets", { identity: tenantMember }),
		);
		expect(response.status).toBe(403);
		const body = JSON.stringify(await response.json());
		expect(body).not.toContain("protected.jpg");
		expect(body).not.toContain("https://files.example/protected.jpg");
	});

	it("verifies and binds provider callbacks before public authorization or effects", async () => {
		const storage = vercelStorage();
		const getIdentity = vi.fn(() => null);
		const backend = makeBackend({
			auth: createAuth(getIdentity),
			storage,
			tenantId: "tenant-a",
		});
		const callbackBody = {
			type: "blob.upload-completed",
			payload: {
				blob: {
					url: "https://evil.example/spoof.jpg",
					pathname: "spoof.jpg",
				},
				tokenPayload: JSON.stringify({
					pathname: "bound.jpg",
					mimeType: "image/jpeg",
					tenantId: "tenant-a",
				}),
			},
		} as const;
		const invalid = await backend.handler(
			request("/media/upload/vercel-blob", {
				method: "POST",
				body: callbackBody,
			}),
		);
		expect(invalid.status).toBe(401);
		expect(await invalid.json()).toMatchObject({
			code: "INVALID_PROVIDER_CALLBACK",
		});
		expect(getIdentity).not.toHaveBeenCalled();
		expect(storage.handleRequest).not.toHaveBeenCalled();

		const validRequest = request("/media/upload/vercel-blob", {
			method: "POST",
			body: callbackBody,
		});
		validRequest.headers.set("x-vercel-signature", "valid");
		const valid = await backend.handler(validRequest);
		expect(valid.status).toBe(200);
		expect(await valid.json()).toEqual({
			type: "blob.upload-completed",
			response: "ok",
		});
		expect(storage.verifyCallback).toHaveBeenCalledTimes(2);
		expect(storage.handleRequest).toHaveBeenCalledOnce();
		expect(getIdentity).toHaveBeenCalledOnce();
	});

	it("rejects concurrent destructive losers before a second storage effect", async () => {
		const storage = directStorage();
		const hooks = vi.fn();
		const backend = makeBackend({
			auth: createAuth(),
			storage,
			tenantId: "tenant-a",
			hooks: { onBeforeDelete: hooks },
		});
		const asset = await seedAsset(backend);
		const api = backend.forRequest(
			request("/delete", { identity: tenantMember }),
		).api.media;
		const settled = await Promise.allSettled([
			api.deleteAsset({ id: asset.id }),
			api.deleteAsset({ id: asset.id }),
		]);
		expect(settled.filter(({ status }) => status === "fulfilled")).toHaveLength(
			1,
		);
		expect(settled.filter(({ status }) => status === "rejected")).toHaveLength(
			1,
		);
		expect(storage.delete).toHaveBeenCalledOnce();
		expect(hooks).toHaveBeenCalledOnce();
	});

	it("keeps trusted raw helpers out of request/internal namespaces and raw prefetch tenant-free", async () => {
		const backend = makeBackend({ auth: createAuth(), tenantId: "tenant-a" });
		const folder = await seedFolder(backend);
		await seedAsset(backend, { folderId: folder.id });
		expect("prefetchForRoute" in backend.internal.media).toBe(false);
		expect("getAssetById" in backend.internal.media).toBe(false);
		expect(
			"prefetchForRoute" in backend.forRequest(request("/raw")).api.media,
		).toBe(false);
		expect("updateAsset" in backend.internal.media).toBe(true);
		const queryClient = new QueryClient();
		await backend.api.media.prefetchForRoute("library", queryClient);
		const cached = queryClient.getQueryData(
			MEDIA_QUERY_KEYS.assetsList({ limit: 40 }),
		);
		expect(JSON.stringify(cached)).not.toContain("tenant-a");
		expect(
			queryClient.getQueryData(MEDIA_QUERY_KEYS.foldersList(null)),
		).toEqual([expect.not.objectContaining({ tenantId: expect.anything() })]);
	});

	it("allows cold anonymous reads only through explicit library and asset public rules", async () => {
		const publicAuthorization = defineAuthorization({
			identity: identitySchema,
			permissions: [mediaPermissions] as const,
			rules: ({ media }) => [
				media.library.read.allow(),
				media.asset.read.allow(),
			],
		});
		const backend = makeBackend({
			auth: createAuth(identityFromRequest, publicAuthorization),
			tenantId: "tenant-a",
		});
		await seedAsset(backend);
		const response = await backend.handler(request("/media/assets"));
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ total: 1 });
	});
});

describe("Vercel callback verifier", () => {
	it("uses the configured secret for an exact body signature", async () => {
		const token = "vercel-secret";
		const body = {
			type: "blob.upload-completed" as const,
			payload: {
				blob: {
					url: "https://x.public.blob.vercel-storage.com/a",
					pathname: "a",
				},
				tokenPayload: JSON.stringify({
					version: 1,
					pathname: "a",
					mimeType: "image/png",
				}),
			},
		};
		const signature = createHmac("sha256", token)
			.update(JSON.stringify(body))
			.digest("hex");
		const { vercelBlobAdapter } = await import("../api/adapters/vercel-blob");
		const adapter = vercelBlobAdapter({ token });
		await expect(
			adapter.verifyCallback(
				new Request("http://localhost", {
					headers: { "x-vercel-signature": signature },
				}),
				body,
			),
		).resolves.toEqual({ pathname: "a", mimeType: "image/png" });
		await expect(
			adapter.verifyCallback(
				new Request("http://localhost", {
					headers: { "x-vercel-signature": `${signature.slice(0, -2)}00` },
				}),
				body,
			),
		).rejects.toThrow("Invalid Vercel Blob callback signature");
	});
});
