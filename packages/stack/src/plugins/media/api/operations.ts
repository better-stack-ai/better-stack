import { AsyncLocalStorage } from "node:async_hooks";
import type { DBAdapter as Adapter } from "@btst/db";
import type { PermissionFactsFor } from "@btst/stack/authorization";
import type { StackIdentity } from "@btst/stack/context";
import {
	type DeepReadonly,
	defineOperation,
	type Operation,
	OperationHttpError,
	type OperationContext,
	type OperationData,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { mediaPermissions } from "../permissions";
import {
	AssetListQuerySchema,
	createAssetSchema,
	createFolderSchema,
	updateAssetSchema,
	uploadTokenRequestSchema,
} from "../schemas";
import type {
	Asset,
	Folder,
	SerializedAsset,
	SerializedFolder,
} from "../types";
import {
	getAssetById,
	getFolderById,
	listAssets,
	listFolders,
} from "./getters";
import { createAsset } from "./mutations";
import { serializeAsset, serializeFolder } from "./serializers";
import {
	isDirectAdapter,
	isS3Adapter,
	isVercelBlobAdapter,
	type S3UploadToken,
	type StorageAdapter,
	type VercelBlobHandleUploadBody,
	type VercelBlobUploadCompletedBody,
} from "./storage-adapter";

/** Runtime input for one asset operation. */
export const AssetIdOperationInputSchema = z.object({ id: z.string() });
/** Runtime input for an asset update operation. */
export const UpdateAssetOperationInputSchema = z.object({
	id: z.string(),
	data: updateAssetSchema,
});
/** Runtime input for one folder operation. */
export const FolderIdOperationInputSchema = z.object({ id: z.string() });
/** Runtime input for a folder collection operation. */
export const FolderListOperationInputSchema = z.object({
	parentId: z.string().nullable().optional(),
});
/** Runtime input for a direct file upload operation. */
export const DirectUploadOperationInputSchema = z.object({
	filename: z.string().min(1),
	mimeType: z.string(),
	size: z.number().int().min(0),
	contentBase64: z.string(),
	folderId: z.string().optional(),
});

const VercelGenerateBodySchema = z.object({
	type: z.literal("blob.generate-client-token"),
	payload: z.object({
		pathname: z.string(),
		multipart: z.boolean(),
		clientPayload: z.string().nullable(),
		callbackUrl: z.string().optional(),
	}),
});
const VercelCallbackBodyShape = z.object({
	type: z.literal("blob.upload-completed"),
	payload: z.object({
		blob: z.object({ url: z.string(), pathname: z.string() }),
		tokenPayload: z.string().nullable().optional(),
	}),
});
// Provider signatures cover JSON.stringify() of the exact parsed request body.
// Validate the required shape without stripping or reordering provider fields.
const VercelCallbackBodySchema = z.custom<
	z.output<typeof VercelCallbackBodyShape>
>(
	(value) => VercelCallbackBodyShape.safeParse(value).success,
	"Invalid Vercel Blob callback body",
);
const LegacyVercelGenerateBodySchema = z.object({
	pathname: z.string(),
	clientPayload: z.string().nullable().optional(),
});
const VercelClientPayloadSchema = z.object({
	mimeType: z.string().min(1).optional(),
	size: z.number().int().min(0).optional(),
	folderId: z.string().min(1).optional(),
});
/** Runtime input for the Vercel Blob token and callback operation. */
export const VercelBlobOperationInputSchema = z.object({
	body: z.union([
		VercelGenerateBodySchema,
		VercelCallbackBodySchema,
		LegacyVercelGenerateBodySchema,
	]),
});

type LibraryReadFacts = PermissionFactsFor<
	typeof mediaPermissions.library.read
>;
type AssetReadFacts = PermissionFactsFor<typeof mediaPermissions.asset.read>;
type AssetUpdateFacts = PermissionFactsFor<
	typeof mediaPermissions.asset.update
>;
type AssetDeleteFacts = PermissionFactsFor<
	typeof mediaPermissions.asset.delete
>;
type AssetUploadFacts = PermissionFactsFor<
	typeof mediaPermissions.asset.upload
>;
type FolderCreateFacts = PermissionFactsFor<
	typeof mediaPermissions.folder.create
>;
type FolderDeleteFacts = PermissionFactsFor<
	typeof mediaPermissions.folder.delete
>;

/** An authorized, row-filtered page of Media assets. */
export interface MediaAssetListResult {
	readonly items: readonly SerializedAsset[];
	readonly total: number;
	readonly limit?: number;
	readonly offset?: number;
}

/** Complete Media operation inventory shared by every server transport. */
export type MediaOperations = {
	readonly listAssets: Operation<
		typeof AssetListQuerySchema,
		typeof mediaPermissions.library.read,
		MediaAssetListResult
	>;
	readonly createAsset: Operation<
		typeof createAssetSchema,
		typeof mediaPermissions.asset.upload,
		SerializedAsset
	>;
	readonly updateAsset: Operation<
		typeof UpdateAssetOperationInputSchema,
		typeof mediaPermissions.asset.update,
		SerializedAsset
	>;
	readonly deleteAsset: Operation<
		typeof AssetIdOperationInputSchema,
		typeof mediaPermissions.asset.delete,
		{ readonly success: true }
	>;
	readonly listFolders: Operation<
		typeof FolderListOperationInputSchema,
		typeof mediaPermissions.library.read,
		readonly SerializedFolder[]
	>;
	readonly createFolder: Operation<
		typeof createFolderSchema,
		typeof mediaPermissions.folder.create,
		SerializedFolder
	>;
	readonly deleteFolder: Operation<
		typeof FolderIdOperationInputSchema,
		typeof mediaPermissions.folder.delete,
		{ readonly success: true }
	>;
	readonly uploadDirect: Operation<
		typeof DirectUploadOperationInputSchema,
		typeof mediaPermissions.asset.upload,
		SerializedAsset
	>;
	readonly uploadToken: Operation<
		typeof uploadTokenRequestSchema,
		typeof mediaPermissions.asset.upload,
		S3UploadToken
	>;
	readonly uploadVercelBlob: Operation<
		typeof VercelBlobOperationInputSchema,
		typeof mediaPermissions.asset.upload,
		OperationData
	>;
};

/** A domain/HTTP failure raised after Media authorization succeeds. */
export class MediaOperationError extends OperationHttpError {
	constructor(statusCode: number, message: string, code: string) {
		super(statusCode, message, code);
		this.name = "MediaOperationError";
	}
}

/** Typed context passed to Media lifecycle hooks after authorization succeeds. */
export interface MediaApiContext<TInput = unknown, TFacts = unknown> {
	readonly input: DeepReadonly<TInput>;
	readonly facts: DeepReadonly<TFacts>;
	readonly identity: DeepReadonly<StackIdentity> | null;
	readonly request?: Request;
	readonly headers?: Headers;
	readonly body?: unknown;
	readonly params?: unknown;
	readonly query?: unknown;
}

/** Typed post-operation context passed to Media result lifecycle hooks. */
export interface MediaApiResultContext<
	TInput = unknown,
	TFacts = unknown,
	TResult = unknown,
> extends MediaApiContext<TInput, TFacts> {
	readonly result: DeepReadonly<TResult>;
}

/** Validated input passed to upload lifecycle hooks. */
export type MediaUploadOperationInput =
	| z.output<typeof createAssetSchema>
	| z.output<typeof DirectUploadOperationInputSchema>
	| z.output<typeof uploadTokenRequestSchema>
	| z.output<typeof VercelBlobOperationInputSchema>;

/** Validated input for upload operations that create an asset result. */
export type MediaUploadResultOperationInput =
	| z.output<typeof createAssetSchema>
	| z.output<typeof DirectUploadOperationInputSchema>;

/** Every typed Media lifecycle error context. */
export type MediaOperationHookContext =
	| MediaApiContext<z.output<typeof AssetListQuerySchema>, LibraryReadFacts>
	| MediaApiContext<z.output<typeof createAssetSchema>, AssetUploadFacts>
	| MediaApiContext<
			z.output<typeof UpdateAssetOperationInputSchema>,
			AssetUpdateFacts
	  >
	| MediaApiContext<
			z.output<typeof AssetIdOperationInputSchema>,
			AssetDeleteFacts
	  >
	| MediaApiContext<
			z.output<typeof FolderListOperationInputSchema>,
			LibraryReadFacts
	  >
	| MediaApiContext<z.output<typeof createFolderSchema>, FolderCreateFacts>
	| MediaApiContext<
			z.output<typeof FolderIdOperationInputSchema>,
			FolderDeleteFacts
	  >
	| MediaApiContext<
			z.output<typeof DirectUploadOperationInputSchema>,
			AssetUploadFacts
	  >
	| MediaApiContext<z.output<typeof uploadTokenRequestSchema>, AssetUploadFacts>
	| MediaApiContext<
			z.output<typeof VercelBlobOperationInputSchema>,
			AssetUploadFacts
	  >;

/** Configuration hooks for the Media operation lifecycle. */
export interface MediaBackendHooks {
	onBeforeUpload?: (
		meta: { filename: string; mimeType: string; size?: number },
		context: MediaApiContext<MediaUploadOperationInput, AssetUploadFacts>,
	) => Promise<void> | void;
	onAfterUpload?: (
		asset: DeepReadonly<SerializedAsset>,
		context: MediaApiResultContext<
			MediaUploadResultOperationInput,
			AssetUploadFacts,
			SerializedAsset
		>,
	) => Promise<void> | void;
	onBeforeDelete?: (
		asset: DeepReadonly<SerializedAsset>,
		context: MediaApiContext<
			z.output<typeof AssetIdOperationInputSchema>,
			AssetDeleteFacts
		>,
	) => Promise<void> | void;
	onAfterDelete?: (
		assetId: string,
		context: MediaApiResultContext<
			z.output<typeof AssetIdOperationInputSchema>,
			AssetDeleteFacts,
			{ readonly success: true }
		>,
	) => Promise<void> | void;
	onBeforeListAssets?: (
		filter: z.output<typeof AssetListQuerySchema>,
		context: MediaApiContext<
			z.output<typeof AssetListQuerySchema>,
			LibraryReadFacts
		>,
	) => Promise<void> | void;
	onBeforeUpdateAsset?: (
		asset: DeepReadonly<SerializedAsset>,
		updates: z.output<typeof updateAssetSchema>,
		context: MediaApiContext<
			z.output<typeof UpdateAssetOperationInputSchema>,
			AssetUpdateFacts
		>,
	) => Promise<void> | void;
	onBeforeListFolders?: (
		filter: { parentId?: string | null },
		context: MediaApiContext<
			z.output<typeof FolderListOperationInputSchema>,
			LibraryReadFacts
		>,
	) => Promise<void> | void;
	onBeforeCreateFolder?: (
		input: z.output<typeof createFolderSchema>,
		context: MediaApiContext<
			z.output<typeof createFolderSchema>,
			FolderCreateFacts
		>,
	) => Promise<void> | void;
	onBeforeDeleteFolder?: (
		folder: DeepReadonly<SerializedFolder>,
		context: MediaApiContext<
			z.output<typeof FolderIdOperationInputSchema>,
			FolderDeleteFacts
		>,
	) => Promise<void> | void;
	/** Observes failures after authorization without replacing the original error. */
	onOperationError?: (
		error: Error,
		context: MediaOperationHookContext,
	) => Promise<void> | void;
}

interface MediaResolverContext {
	readonly input: unknown;
	readonly request?: Request;
	readonly headers?: Headers;
	readonly body?: unknown;
	readonly params?: unknown;
	readonly query?: unknown;
}

/** Server-only dependencies and lifecycle configuration for Media operations. */
export interface MediaOperationsConfig {
	/** Storage provider used for upload initialization, storage effects, and cleanup. */
	storageAdapter: StorageAdapter;
	/** Maximum accepted upload size in bytes. */
	maxFileSizeBytes?: number;
	/** Optional exact or wildcard MIME allowlist. */
	allowedMimeTypes?: string[];
	/** Trusted public URL prefixes accepted during asset finalization. */
	allowedUrlPrefixes?: string[];
	/** Post-authorization Media domain lifecycle hooks. */
	hooks?: MediaBackendHooks;
	/** Resolve server-only collection scope from validated input/request context. */
	resolveTenantId?: (
		context: MediaResolverContext,
	) => Promise<string | null | undefined> | string | null | undefined;
}

interface AssetSnapshot {
	readonly id: string;
	readonly filename: string;
	readonly originalName: string;
	readonly mimeType: string;
	readonly size: number;
	readonly url: string;
	readonly folderId?: string;
	readonly alt?: string;
	readonly tenantId?: string;
	readonly createdAt: Date;
	readonly updatedAt?: Date;
}

interface FolderSnapshot {
	readonly id: string;
	readonly name: string;
	readonly parentId?: string;
	readonly tenantId?: string;
	readonly createdAt: Date;
	readonly updatedAt?: Date;
}

function assetSnapshot(asset: Asset): AssetSnapshot {
	return {
		id: asset.id,
		filename: asset.filename,
		originalName: asset.originalName,
		mimeType: asset.mimeType,
		size: asset.size,
		url: asset.url,
		...(asset.folderId ? { folderId: asset.folderId } : {}),
		...(asset.alt ? { alt: asset.alt } : {}),
		...(asset.tenantId ? { tenantId: asset.tenantId } : {}),
		createdAt: asset.createdAt,
		...(asset.updatedAt ? { updatedAt: asset.updatedAt } : {}),
	};
}

function folderSnapshot(folder: Folder): FolderSnapshot {
	return {
		id: folder.id,
		name: folder.name,
		...(folder.parentId ? { parentId: folder.parentId } : {}),
		...(folder.tenantId ? { tenantId: folder.tenantId } : {}),
		createdAt: folder.createdAt,
		...(folder.updatedAt ? { updatedAt: folder.updatedAt } : {}),
	};
}

function sameDate(left: Date | undefined, right: Date | undefined) {
	return left?.getTime() === right?.getTime();
}

function sameAsset(asset: Asset | null, expected: AssetSnapshot) {
	return (
		asset !== null &&
		asset.id === expected.id &&
		asset.filename === expected.filename &&
		asset.originalName === expected.originalName &&
		asset.mimeType === expected.mimeType &&
		asset.size === expected.size &&
		asset.url === expected.url &&
		(asset.folderId || undefined) === expected.folderId &&
		(asset.alt || undefined) === expected.alt &&
		(asset.tenantId || undefined) === expected.tenantId &&
		sameDate(asset.createdAt, expected.createdAt) &&
		sameDate(asset.updatedAt, expected.updatedAt)
	);
}

function sameFolder(folder: Folder | null, expected: FolderSnapshot) {
	return (
		folder !== null &&
		folder.id === expected.id &&
		folder.name === expected.name &&
		(folder.parentId || undefined) === expected.parentId &&
		(folder.tenantId || undefined) === expected.tenantId &&
		sameDate(folder.createdAt, expected.createdAt) &&
		sameDate(folder.updatedAt, expected.updatedAt)
	);
}

function nextVersion(previous: Date) {
	return new Date(Math.max(Date.now(), previous.getTime() + 1));
}

const AFFECTED_ROW_KEYS = [
	"rowCount",
	"affectedRows",
	"rowsAffected",
	"changes",
	"numUpdatedRows",
] as const;

function positive(value: unknown) {
	return (
		(typeof value === "number" && Number.isFinite(value) && value > 0) ||
		(typeof value === "bigint" && value > 0n)
	);
}

function didAffectRow(result: unknown, id: string): boolean {
	if (typeof result === "number" || typeof result === "bigint")
		return positive(result);
	if (!result || typeof result !== "object") return false;
	const record = result as Record<string, unknown>;
	if ("count" in record) return positive(record.count);
	if (Array.isArray(result))
		return result.length > 0 && didAffectRow(result[0], id);
	for (const key of AFFECTED_ROW_KEYS) {
		if (key in record) return positive(record[key]);
	}
	if ("meta" in record) {
		const meta = record.meta;
		return Boolean(
			meta &&
				typeof meta === "object" &&
				"changes" in meta &&
				positive((meta as Record<string, unknown>).changes),
		);
	}
	return record.id === id;
}

function assetWhere(snapshot: AssetSnapshot) {
	return [
		{ field: "id", value: snapshot.id, operator: "eq" as const },
		{ field: "filename", value: snapshot.filename, operator: "eq" as const },
		{
			field: "originalName",
			value: snapshot.originalName,
			operator: "eq" as const,
		},
		{ field: "mimeType", value: snapshot.mimeType, operator: "eq" as const },
		{ field: "size", value: snapshot.size, operator: "eq" as const },
		{ field: "url", value: snapshot.url, operator: "eq" as const },
		{
			field: "folderId",
			value: snapshot.folderId ?? null,
			operator: "eq" as const,
		},
		{ field: "alt", value: snapshot.alt ?? null, operator: "eq" as const },
		{
			field: "tenantId",
			value: snapshot.tenantId ?? null,
			operator: "eq" as const,
		},
		{ field: "createdAt", value: snapshot.createdAt, operator: "eq" as const },
		...(snapshot.updatedAt
			? [
					{
						field: "updatedAt",
						value: snapshot.updatedAt,
						operator: "eq" as const,
					},
				]
			: []),
	];
}

function folderWhere(snapshot: FolderSnapshot) {
	return [
		{ field: "id", value: snapshot.id, operator: "eq" as const },
		{ field: "name", value: snapshot.name, operator: "eq" as const },
		{
			field: "parentId",
			value: snapshot.parentId ?? null,
			operator: "eq" as const,
		},
		{
			field: "tenantId",
			value: snapshot.tenantId ?? null,
			operator: "eq" as const,
		},
		{ field: "createdAt", value: snapshot.createdAt, operator: "eq" as const },
		...(snapshot.updatedAt
			? [
					{
						field: "updatedAt",
						value: snapshot.updatedAt,
						operator: "eq" as const,
					},
				]
			: []),
	];
}

function staleStateError() {
	return new MediaOperationError(
		409,
		"Media state changed while authorization was being evaluated. Retry the operation.",
		"MEDIA_STATE_CHANGED",
	);
}

function notFound(entity: "Asset" | "Folder") {
	return new MediaOperationError(
		404,
		`${entity} not found`,
		`${entity.toUpperCase()}_NOT_FOUND`,
	);
}

function normalizeError(error: unknown, fallback: string) {
	return error instanceof Error
		? error
		: new Error(typeof error === "string" ? error : fallback, { cause: error });
}

async function runDomainHook<T>(
	run: () => Promise<T> | T,
	code: string,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		throw new MediaOperationError(
			403,
			normalizeError(error, "Media operation rejected").message,
			code,
		);
	}
}

function hookContext<TInput, TFacts, TResult>(
	context: OperationContext<TInput, TFacts> & {
		readonly result: DeepReadonly<TResult>;
	},
	legacy?: { body?: unknown; params?: unknown; query?: unknown },
): MediaApiResultContext<TInput, TFacts, TResult>;
function hookContext<TInput, TFacts>(
	context: OperationContext<TInput, TFacts>,
	legacy?: { body?: unknown; params?: unknown; query?: unknown },
): MediaApiContext<TInput, TFacts>;
function hookContext<TInput, TFacts, TResult>(
	context:
		| OperationContext<TInput, TFacts>
		| (OperationContext<TInput, TFacts> & {
				readonly result: DeepReadonly<TResult>;
		  }),
	legacy: { body?: unknown; params?: unknown; query?: unknown } = {},
):
	| MediaApiContext<TInput, TFacts>
	| MediaApiResultContext<TInput, TFacts, TResult> {
	return Object.freeze({
		...context,
		...(context.request
			? { request: context.request, headers: context.request.headers }
			: {}),
		...legacy,
	});
}

async function notifyError(
	hook: MediaBackendHooks["onOperationError"],
	error: unknown,
	context: OperationContext<any, any>,
	legacy: { body?: unknown; params?: unknown; query?: unknown } = {},
) {
	try {
		await hook?.(
			normalizeError(error, "Media operation failed"),
			hookContext(context, legacy) as MediaOperationHookContext,
		);
	} catch {
		// Error hooks are observational and never replace the operation failure.
	}
}

function matchesUrlPrefix(url: string, prefix: string): boolean {
	const trimmed = prefix.trim();
	if (!trimmed) return false;
	if (/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) {
		if (trimmed.endsWith("://")) return url.startsWith(trimmed);
		const normalized = trimmed.replace(/\/+$/, "");
		return url === normalized || url.startsWith(`${normalized}/`);
	}
	return url.startsWith(`${trimmed.replace(/\/+$/, "")}/`);
}

function sanitizeS3KeySegment(value: string): string {
	return value.replace(/[/\\]/g, "-").replace(/\.\./g, "_").trim() || "unknown";
}

function validateMimeType(mimeType: string, allowed?: readonly string[]) {
	if (!allowed?.length) return;
	const accepted = allowed.some((pattern) =>
		pattern.endsWith("/*")
			? mimeType.startsWith(pattern.slice(0, -1))
			: mimeType === pattern,
	);
	if (!accepted) {
		throw new MediaOperationError(
			415,
			`MIME type '${mimeType}' is not allowed. Allowed: ${allowed.join(", ")}`,
			"MIME_TYPE_NOT_ALLOWED",
		);
	}
}

function validateSize(size: number, maximum: number) {
	if (size > maximum) {
		throw new MediaOperationError(
			413,
			`File size ${size} bytes exceeds the limit of ${maximum} bytes`,
			"FILE_TOO_LARGE",
		);
	}
}

function validateAssetUrl(
	url: string,
	storageAdapter: StorageAdapter,
	allowedUrlPrefixes?: readonly string[],
) {
	let allowed = true;
	let message = "";
	if (allowedUrlPrefixes?.length) {
		allowed = allowedUrlPrefixes.some((prefix) =>
			matchesUrlPrefix(url, prefix),
		);
		message = `URL must start with one of: ${allowedUrlPrefixes.join(", ")}`;
	} else if (isDirectAdapter(storageAdapter)) {
		allowed = false;
		message =
			"Client-supplied asset URLs are not allowed with localAdapter. Use POST /media/upload instead, or configure allowedUrlPrefixes to explicitly allow trusted URL prefixes.";
	} else if (isS3Adapter(storageAdapter)) {
		allowed = matchesUrlPrefix(url, storageAdapter.urlPrefix);
		message = `URL must start with the configured S3 publicBaseUrl: ${storageAdapter.urlPrefix}`;
	} else if (isVercelBlobAdapter(storageAdapter)) {
		try {
			allowed = new URL(url).hostname.endsWith(
				storageAdapter.urlHostnameSuffix,
			);
		} catch {
			allowed = false;
		}
		message = `URL hostname must end with ${storageAdapter.urlHostnameSuffix}`;
	}
	if (!allowed)
		throw new MediaOperationError(400, message, "ASSET_URL_NOT_ALLOWED");
}

function assetFacts(snapshot: AssetSnapshot) {
	return {
		assetId: snapshot.id,
		...(snapshot.folderId ? { folderId: snapshot.folderId } : {}),
		mimeType: snapshot.mimeType,
		...(snapshot.tenantId ? { tenantId: snapshot.tenantId } : {}),
	};
}

function folderFacts(snapshot: FolderSnapshot) {
	return {
		folderId: snapshot.id,
		...(snapshot.parentId ? { parentId: snapshot.parentId } : {}),
		...(snapshot.tenantId ? { tenantId: snapshot.tenantId } : {}),
	};
}

function withoutTenant<T extends { tenantId?: string | null }>(
	value: T,
): Omit<T, "tenantId"> {
	const { tenantId: _tenantId, ...safe } = value;
	return safe;
}

function plainStorageResult(value: unknown): OperationData {
	if (value === undefined) return null;
	let serialized: string;
	try {
		serialized = JSON.stringify(value);
	} catch (error) {
		throw new TypeError(
			"Storage adapter returned a non-serializable response.",
			{ cause: error },
		);
	}
	if (serialized === undefined) return null;
	return JSON.parse(serialized) as OperationData;
}

type OperationAsset = SerializedAsset & {
	readonly [key: string]: OperationData;
};
type OperationFolder = SerializedFolder & {
	readonly [key: string]: OperationData;
};

function operationAsset(asset: Asset): OperationAsset {
	return serializeAsset(asset) as OperationAsset;
}

function operationFolder(folder: Folder): OperationFolder {
	return serializeFolder(folder) as OperationFolder;
}

function operationUploadToken(token: S3UploadToken) {
	return token as S3UploadToken & { readonly [key: string]: OperationData };
}

const memoryRollbackMarkers = new WeakMap<Adapter, (error: unknown) => void>();

function markMemoryRollback(adapter: Adapter, error: unknown) {
	memoryRollbackMarkers.get(adapter)?.(error);
}

/**
 * The published memory adapter rolls transactions back from a whole-database
 * clone, so overlapping callbacks can otherwise overwrite a later winner.
 * Serialize every access to the shared adapter, including trusted raw API
 * calls, while preserving the adapter's real transaction behavior.
 */
function serializeMemoryOperations(adapter: Adapter): Adapter {
	if (adapter.id !== "memory" || memoryRollbackMarkers.has(adapter)) {
		return adapter;
	}
	const source: Adapter = { ...adapter };
	type TransactionAdapter = Parameters<
		Parameters<Adapter["transaction"]>[0]
	>[0];
	type ActiveAdapter = Omit<Adapter, "transaction"> &
		Partial<Pick<Adapter, "transaction">>;
	type LockContext = {
		owner: object;
		adapter: ActiveAdapter;
		inTransaction?: boolean;
		rollbackError?: unknown;
		rollbackOnly?: boolean;
	};
	const lockContext = new AsyncLocalStorage<LockContext>();
	let tail = Promise.resolve();
	let activeOwner: object | undefined;
	const withLock = async <T>(
		run: (activeAdapter: ActiveAdapter) => Promise<T>,
	): Promise<T> => {
		const inherited = lockContext.getStore();
		if (inherited && inherited.owner === activeOwner) {
			return run(inherited.adapter);
		}
		let release = () => {};
		const previous = tail;
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		const owner = {};
		activeOwner = owner;
		try {
			return await lockContext.run({ owner, adapter: source }, () =>
				run(source),
			);
		} finally {
			if (activeOwner === owner) activeOwner = undefined;
			release();
		}
	};
	const serialized: Adapter = {
		...source,
		create: ((input) =>
			withLock((active) => active.create(input))) as Adapter["create"],
		findOne: ((input) =>
			withLock((active) => active.findOne(input))) as Adapter["findOne"],
		findMany: ((input) =>
			withLock((active) => active.findMany(input))) as Adapter["findMany"],
		count: (input) => withLock((active) => active.count(input)),
		update: ((input) =>
			withLock((active) => active.update(input))) as Adapter["update"],
		updateMany: (input) => withLock((active) => active.updateMany(input)),
		delete: ((input) =>
			withLock((active) => active.delete(input))) as Adapter["delete"],
		deleteMany: (input) => withLock((active) => active.deleteMany(input)),
		consumeOne: ((input) =>
			withLock((active) => active.consumeOne(input))) as Adapter["consumeOne"],
		transaction: ((callback) =>
			withLock((active) => {
				const context = lockContext.getStore();
				if (!context) throw new TypeError("Missing memory lock context.");
				if (context.inTransaction) {
					return callback(active as TransactionAdapter).catch((error) => {
						context.rollbackOnly = true;
						context.rollbackError = error;
						throw error;
					});
				}
				if (!active.transaction) {
					throw new TypeError("Missing memory transaction adapter.");
				}
				return active.transaction((tx) =>
					lockContext.run(
						{ owner: context.owner, adapter: tx, inTransaction: true },
						async () => {
							const transactionContext = lockContext.getStore();
							const result = await callback(tx);
							if (transactionContext?.rollbackOnly) {
								throw transactionContext.rollbackError;
							}
							return result;
						},
					),
				);
			})) as Adapter["transaction"],
	};
	Object.assign(adapter, serialized);
	memoryRollbackMarkers.set(adapter, (error) => {
		const context = lockContext.getStore();
		if (!context || context.owner !== activeOwner || !context.inTransaction) {
			return;
		}
		context.rollbackOnly = true;
		context.rollbackError = error;
	});
	return adapter;
}

function requireAtomicTransactions(adapter: Adapter) {
	if (
		adapter.id !== "memory" &&
		typeof adapter.options?.adapterConfig.transaction !== "function"
	) {
		throw new MediaOperationError(
			500,
			"Media writes require an adapter with isolated transaction support.",
			"ATOMIC_TRANSACTION_REQUIRED",
		);
	}
}

async function claimAsset(
	adapter: Pick<Adapter, "updateMany">,
	snapshot: AssetSnapshot,
) {
	const claimedAt = nextVersion(snapshot.updatedAt ?? snapshot.createdAt);
	const result = await adapter.updateMany({
		model: "mediaAsset",
		where: assetWhere(snapshot),
		update: { updatedAt: claimedAt },
	});
	if (!didAffectRow(result, snapshot.id)) throw staleStateError();
	return claimedAt;
}

async function claimFolder(
	adapter: Pick<Adapter, "updateMany">,
	snapshot: FolderSnapshot,
) {
	const claimedAt = nextVersion(snapshot.updatedAt ?? snapshot.createdAt);
	const result = await adapter.updateMany({
		model: "mediaFolder",
		where: folderWhere(snapshot),
		update: { updatedAt: claimedAt },
	});
	if (!didAffectRow(result, snapshot.id)) throw staleStateError();
	return claimedAt;
}

async function restoreFolder(
	adapter: Pick<Adapter, "updateMany">,
	snapshot: FolderSnapshot,
	claimedAt: Date,
) {
	const result = await adapter.updateMany({
		model: "mediaFolder",
		where: folderWhere({ ...snapshot, updatedAt: claimedAt }),
		update: { updatedAt: snapshot.updatedAt ?? snapshot.createdAt },
	});
	if (!didAffectRow(result, snapshot.id)) throw staleStateError();
}

async function collectFolderSubtree(
	adapter: Pick<Adapter, "findMany">,
	root: FolderSnapshot,
): Promise<FolderSnapshot[]> {
	const subtree = [root];
	const seen = new Set([root.id]);
	for (let index = 0; index < subtree.length; index++) {
		const children = await adapter.findMany<Folder>({
			model: "mediaFolder",
			where: [{ field: "parentId", value: subtree[index]!.id }],
		});
		for (const child of children) {
			if (seen.has(child.id)) throw staleStateError();
			if ((child.tenantId || undefined) !== root.tenantId) {
				throw staleStateError();
			}
			seen.add(child.id);
			subtree.push(folderSnapshot(child));
		}
	}
	return subtree;
}

async function verifyClaimedFolderSubtree(
	adapter: Pick<Adapter, "findMany" | "count">,
	subtree: readonly FolderSnapshot[],
	claims: ReadonlyMap<string, Date>,
) {
	const root = subtree[0];
	if (!root) throw staleStateError();
	const currentSubtree = await collectFolderSubtree(adapter, {
		...root,
		updatedAt: claims.get(root.id)!,
	});
	if (currentSubtree.length !== subtree.length) throw staleStateError();
	const expectedById = new Map(
		subtree.map((folder) => [folder.id, folder] as const),
	);
	for (const current of currentSubtree) {
		const expected = expectedById.get(current.id);
		if (
			!expected ||
			!sameFolder(current, {
				...expected,
				updatedAt: claims.get(expected.id)!,
			})
		) {
			throw staleStateError();
		}
	}
	let totalAssets = 0;
	for (const folder of subtree) {
		totalAssets += await adapter.count({
			model: "mediaAsset",
			where: [{ field: "folderId", value: folder.id }],
		});
	}
	if (totalAssets > 0) {
		throw new MediaOperationError(
			409,
			`Cannot delete folder: it or one of its subfolders contains ${totalAssets} asset(s). Move or delete them first.`,
			"FOLDER_NOT_EMPTY",
		);
	}
}

function parseVercelInitialize(
	body: z.output<typeof VercelBlobOperationInputSchema>["body"],
) {
	const record = body as unknown as Record<string, OperationData>;
	const payload =
		record.payload &&
		typeof record.payload === "object" &&
		!Array.isArray(record.payload)
			? (record.payload as Record<string, OperationData>)
			: record;
	const pathname =
		typeof payload.pathname === "string" ? payload.pathname : "asset";
	const clientPayload =
		typeof payload.clientPayload === "string" ? payload.clientPayload : null;
	let parsed: z.output<typeof VercelClientPayloadSchema> = {};
	try {
		parsed = VercelClientPayloadSchema.parse(
			clientPayload ? JSON.parse(clientPayload) : {},
		);
	} catch {
		throw new MediaOperationError(
			400,
			"Invalid Vercel Blob client upload metadata.",
			"INVALID_UPLOAD_BODY",
		);
	}
	return {
		pathname,
		filename: pathname.split("/").pop() ?? pathname,
		mimeType: parsed.mimeType ?? "application/octet-stream",
		size: parsed.size,
		folderId: parsed.folderId,
	};
}

/** Create the complete Media operation inventory used by every server transport. */
export function createMediaOperations(
	sourceAdapter: Adapter,
	config: MediaOperationsConfig,
): MediaOperations {
	const adapter = serializeMemoryOperations(sourceAdapter);
	const {
		storageAdapter,
		maxFileSizeBytes = 10 * 1024 * 1024,
		allowedMimeTypes,
		allowedUrlPrefixes,
		hooks,
		resolveTenantId,
	} = config;
	const tenants = new WeakMap<object, string | undefined>();
	const assetLists = new WeakMap<
		object,
		Awaited<ReturnType<typeof listAssets>>
	>();
	const assets = new WeakMap<object, AssetSnapshot>();
	const folders = new WeakMap<object, FolderSnapshot | undefined>();
	const targetFolders = new WeakMap<object, FolderSnapshot | undefined>();
	const folderSubtrees = new WeakMap<object, readonly FolderSnapshot[]>();
	const vercelContexts = new WeakMap<
		object,
		{
			phase: "initialize" | "callback";
			pathname: string;
			filename: string;
			mimeType: string;
			size?: number;
			folderId?: string;
			tenantId?: string;
		}
	>();

	const resolveTenant = async (
		input: object,
		request: Request | undefined,
		legacy: { body?: unknown; params?: unknown; query?: unknown },
	) => {
		const tenantId =
			request && resolveTenantId
				? ((await resolveTenantId({
						input,
						request,
						headers: request.headers,
						...legacy,
					})) ?? undefined)
				: undefined;
		tenants.set(input, tenantId);
		return tenantId;
	};

	const loadFolder = async (
		id: string | undefined,
		tenantId: string | undefined,
	) => {
		if (!id) return undefined;
		const folder = await getFolderById(adapter, id);
		if (!folder || (tenantId !== undefined && folder.tenantId !== tenantId)) {
			throw notFound("Folder");
		}
		return folderSnapshot(folder);
	};

	const bindFolderTenant = (
		input: object,
		resolvedTenantId: string | undefined,
		folder: FolderSnapshot | undefined,
	) => {
		const tenantId = resolvedTenantId ?? folder?.tenantId;
		tenants.set(input, tenantId);
		return tenantId;
	};

	const verifyFolder = async (
		reader: Pick<Adapter, "findOne">,
		snapshot: FolderSnapshot | undefined,
	) => {
		if (!snapshot) return;
		const current =
			(await reader.findOne<Folder>({
				model: "mediaFolder",
				where: [{ field: "id", value: snapshot.id }],
			})) ?? null;
		if (!sameFolder(current, snapshot)) throw staleStateError();
	};

	const listAssetsOperation = defineOperation({
		input: AssetListQuerySchema,
		permission: mediaPermissions.library.read,
		facts: async ({ input, request }) => {
			await resolveTenant(input as object, request, { query: input });
			return undefined;
		},
		additionalPermissions: async ({ input }) => {
			const result = await listAssets(adapter, {
				...input,
				tenantId: tenants.get(input as object),
			});
			assetLists.set(input as object, result);
			return result.items.map((asset) =>
				mediaPermissions.asset.read(assetFacts(assetSnapshot(asset))),
			);
		},
		execute: async (context) => {
			await runDomainHook(
				() =>
					hooks?.onBeforeListAssets?.(
						{ ...context.input },
						hookContext(context, { query: context.input }),
					),
				"LIST_ASSETS_REJECTED",
			);
			const result = assetLists.get(context.input as object);
			assetLists.delete(context.input as object);
			if (!result) {
				throw new MediaOperationError(
					500,
					"Asset-list authorization snapshot is unavailable.",
					"AUTHORIZATION_SNAPSHOT_MISSING",
				);
			}
			return {
				items: result.items.map((asset) =>
					withoutTenant(serializeAsset(asset)),
				),
				total: result.total,
				...(result.limit !== undefined ? { limit: result.limit } : {}),
				...(result.offset !== undefined ? { offset: result.offset } : {}),
			};
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks?.onOperationError, error, context, {
				query: context.input,
			}),
	});

	const createAssetOperation = defineOperation({
		input: createAssetSchema,
		permission: mediaPermissions.asset.upload,
		facts: async ({ input, request }) => {
			const tenantId = await resolveTenant(input as object, request, {
				body: input,
			});
			const folder = await loadFolder(input.folderId, tenantId);
			const effectiveTenantId = bindFolderTenant(
				input as object,
				tenantId,
				folder,
			);
			folders.set(input as object, folder);
			return {
				phase: "finalize" as const,
				...(folder ? { folderId: folder.id } : {}),
				mimeType: input.mimeType,
				...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
			} satisfies AssetUploadFacts;
		},
		execute: (context) => {
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				const folder = folders.get(context.input as object);
				await verifyFolder(tx, folder);
				const folderClaim = folder ? await claimFolder(tx, folder) : undefined;
				await runDomainHook(
					() =>
						hooks?.onBeforeUpload?.(
							{
								filename: context.input.filename,
								mimeType: context.input.mimeType,
								size: context.input.size,
							},
							hookContext(context, { body: context.input }),
						),
					"UPLOAD_REJECTED",
				);
				validateMimeType(context.input.mimeType, allowedMimeTypes);
				validateSize(context.input.size, maxFileSizeBytes);
				validateAssetUrl(context.input.url, storageAdapter, allowedUrlPrefixes);
				const asset = await createAsset(tx, {
					...context.input,
					tenantId: tenants.get(context.input as object),
				});
				if (folder && folderClaim) await restoreFolder(tx, folder, folderClaim);
				return operationAsset(asset);
			});
		},
		after: ((context: any) =>
			hooks?.onAfterUpload?.(
				context.result,
				hookContext(context, { body: context.input }) as MediaApiResultContext<
					z.output<typeof createAssetSchema>,
					AssetUploadFacts,
					SerializedAsset
				>,
			)) as any,
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onOperationError, error, context, {
				body: context.input,
			});
		},
	});

	const updateAssetOperation = defineOperation({
		input: UpdateAssetOperationInputSchema,
		permission: mediaPermissions.asset.update,
		facts: async ({ input, request }) => {
			const tenantId = await resolveTenant(input as object, request, {
				body: input.data,
				params: { id: input.id },
			});
			const asset = await getAssetById(adapter, input.id);
			if (!asset || (tenantId !== undefined && asset.tenantId !== tenantId)) {
				throw notFound("Asset");
			}
			const snapshot = assetSnapshot(asset);
			assets.set(input as object, snapshot);
			const changesFolder = Object.hasOwn(input.data, "folderId");
			const target =
				typeof input.data.folderId === "string"
					? await loadFolder(input.data.folderId, tenantId)
					: undefined;
			if (target && target.tenantId !== snapshot.tenantId) {
				throw notFound("Folder");
			}
			targetFolders.set(input as object, target);
			return {
				...assetFacts(snapshot),
				...(changesFolder ? { targetFolderId: target?.id ?? null } : {}),
			} satisfies AssetUpdateFacts;
		},
		execute: (context) => {
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				const snapshot = assets.get(context.input as object);
				if (!snapshot) throw staleStateError();
				const current =
					(await tx.findOne<Asset>({
						model: "mediaAsset",
						where: [{ field: "id", value: snapshot.id }],
					})) ?? null;
				if (!sameAsset(current, snapshot)) throw staleStateError();
				const target = targetFolders.get(context.input as object);
				await verifyFolder(tx, target);
				const targetClaim = target ? await claimFolder(tx, target) : undefined;
				const claimedAt = await claimAsset(tx, snapshot);
				await runDomainHook(
					() =>
						hooks?.onBeforeUpdateAsset?.(
							operationAsset(current as Asset),
							{ ...context.input.data },
							hookContext(context, {
								body: context.input.data,
								params: { id: context.input.id },
							}),
						),
					"UPDATE_ASSET_REJECTED",
				);
				const update = {
					...(context.input.data.alt !== undefined
						? { alt: context.input.data.alt }
						: {}),
					...(Object.hasOwn(context.input.data, "folderId")
						? { folderId: context.input.data.folderId }
						: {}),
					updatedAt: nextVersion(claimedAt),
				};
				const matched = await tx.updateMany({
					model: "mediaAsset",
					where: assetWhere({ ...snapshot, updatedAt: claimedAt }),
					update,
				});
				if (!didAffectRow(matched, snapshot.id)) throw staleStateError();
				if (target && targetClaim) await restoreFolder(tx, target, targetClaim);
				const updated = await getAssetById(tx, snapshot.id);
				if (!updated) throw notFound("Asset");
				return operationAsset(updated);
			});
		},
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onOperationError, error, context, {
				body: context.input.data,
				params: { id: context.input.id },
			});
		},
	});

	const deleteAssetOperation = defineOperation({
		input: AssetIdOperationInputSchema,
		permission: mediaPermissions.asset.delete,
		facts: async ({ input, request }) => {
			const tenantId = await resolveTenant(input as object, request, {
				params: { id: input.id },
			});
			const asset = await getAssetById(adapter, input.id);
			if (!asset || (tenantId !== undefined && asset.tenantId !== tenantId)) {
				throw notFound("Asset");
			}
			const snapshot = assetSnapshot(asset);
			assets.set(input as object, snapshot);
			return assetFacts(snapshot) satisfies AssetDeleteFacts;
		},
		execute: (context) => {
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				const snapshot = assets.get(context.input as object);
				if (!snapshot) throw staleStateError();
				const current = await getAssetById(tx, snapshot.id);
				if (!sameAsset(current, snapshot)) throw staleStateError();
				const claimedAt = await claimAsset(tx, snapshot);
				await runDomainHook(
					() =>
						hooks?.onBeforeDelete?.(
							operationAsset(current as Asset),
							hookContext(context, { params: { id: context.input.id } }),
						),
					"DELETE_ASSET_REJECTED",
				);
				try {
					await storageAdapter.delete(snapshot.url);
				} catch (error) {
					throw new MediaOperationError(
						500,
						"Failed to delete file from storage",
						"STORAGE_DELETE_FAILED",
					);
				}
				const deleted = await tx.deleteMany({
					model: "mediaAsset",
					where: assetWhere({ ...snapshot, updatedAt: claimedAt }),
				});
				if (!didAffectRow(deleted, snapshot.id)) throw staleStateError();
				return { success: true } as const;
			});
		},
		after: (context) =>
			hooks?.onAfterDelete?.(
				context.input.id,
				hookContext(context, { params: { id: context.input.id } }),
			),
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onOperationError, error, context, {
				params: { id: context.input.id },
			});
		},
	});

	const listFoldersOperation = defineOperation({
		input: FolderListOperationInputSchema,
		permission: mediaPermissions.library.read,
		facts: async ({ input, request }) => {
			await resolveTenant(input as object, request, { query: input });
			return undefined;
		},
		execute: async (context) => {
			const filter = { parentId: context.input.parentId };
			await runDomainHook(
				() =>
					hooks?.onBeforeListFolders?.(
						filter,
						hookContext(context, { query: context.input }),
					),
				"LIST_FOLDERS_REJECTED",
			);
			const result = await listFolders(adapter, {
				...filter,
				tenantId: tenants.get(context.input as object),
			});
			return result.map((folder) => withoutTenant(serializeFolder(folder)));
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks?.onOperationError, error, context, {
				query: context.input,
			}),
	});

	const createFolderOperation = defineOperation({
		input: createFolderSchema,
		permission: mediaPermissions.folder.create,
		facts: async ({ input, request }) => {
			const tenantId = await resolveTenant(input as object, request, {
				body: input,
			});
			const parent = await loadFolder(input.parentId, tenantId);
			const effectiveTenantId = bindFolderTenant(
				input as object,
				tenantId,
				parent,
			);
			folders.set(input as object, parent);
			return {
				...(parent ? { parentId: parent.id } : {}),
				...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
			} satisfies FolderCreateFacts;
		},
		execute: (context) => {
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				const parent = folders.get(context.input as object);
				await verifyFolder(tx, parent);
				const parentClaim = parent ? await claimFolder(tx, parent) : undefined;
				await runDomainHook(
					() =>
						hooks?.onBeforeCreateFolder?.(
							{ ...context.input },
							hookContext(context, { body: context.input }),
						),
					"CREATE_FOLDER_REJECTED",
				);
				const now = new Date();
				const folder = await tx.create<Folder>({
					model: "mediaFolder",
					data: {
						...context.input,
						tenantId: tenants.get(context.input as object),
						createdAt: now,
						updatedAt: now,
					},
				});
				if (parent && parentClaim) await restoreFolder(tx, parent, parentClaim);
				return operationFolder(folder);
			});
		},
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onOperationError, error, context, {
				body: context.input,
			});
		},
	});

	const deleteFolderOperation = defineOperation({
		input: FolderIdOperationInputSchema,
		permission: mediaPermissions.folder.delete,
		facts: async ({ input, request }) => {
			const tenantId = await resolveTenant(input as object, request, {
				params: { id: input.id },
			});
			const folder = await loadFolder(input.id, tenantId);
			if (!folder) throw notFound("Folder");
			folders.set(input as object, folder);
			return folderFacts(folder) satisfies FolderDeleteFacts;
		},
		additionalPermissions: async ({ input }) => {
			const root = folders.get(input as object);
			if (!root) throw staleStateError();
			const subtree = await collectFolderSubtree(adapter, root);
			folderSubtrees.set(input as object, subtree);
			return subtree
				.slice(1)
				.map((folder) => mediaPermissions.folder.delete(folderFacts(folder)));
		},
		execute: (context) => {
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				const subtree = folderSubtrees.get(context.input as object);
				folderSubtrees.delete(context.input as object);
				if (!subtree?.length) throw staleStateError();
				const snapshot = subtree[0]!;
				const claims = new Map<string, Date>();
				for (const folder of subtree) {
					claims.set(folder.id, await claimFolder(tx, folder));
				}
				await verifyClaimedFolderSubtree(tx, subtree, claims);
				await runDomainHook(
					() =>
						hooks?.onBeforeDeleteFolder?.(
							operationFolder({
								...snapshot,
								updatedAt: snapshot.updatedAt,
							}),
							hookContext(context, { params: { id: context.input.id } }),
						),
					"DELETE_FOLDER_REJECTED",
				);
				await verifyClaimedFolderSubtree(tx, subtree, claims);
				for (const folder of [...subtree].reverse()) {
					const deleted = await tx.deleteMany({
						model: "mediaFolder",
						where: folderWhere({
							...folder,
							updatedAt: claims.get(folder.id)!,
						}),
					});
					if (!didAffectRow(deleted, folder.id)) throw staleStateError();
				}
				return { success: true } as const;
			});
		},
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onOperationError, error, context, {
				params: { id: context.input.id },
			});
		},
	});

	const uploadDirectOperation = defineOperation({
		input: DirectUploadOperationInputSchema,
		permission: mediaPermissions.asset.upload,
		facts: async ({ input, request }) => {
			const tenantId = await resolveTenant(input as object, request, {
				body: input,
			});
			const folder = await loadFolder(input.folderId, tenantId);
			const effectiveTenantId = bindFolderTenant(
				input as object,
				tenantId,
				folder,
			);
			folders.set(input as object, folder);
			return {
				phase: "direct" as const,
				...(folder ? { folderId: folder.id } : {}),
				mimeType: input.mimeType,
				...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
			} satisfies AssetUploadFacts;
		},
		execute: async (context) => {
			requireAtomicTransactions(adapter);
			if (!isDirectAdapter(storageAdapter)) {
				throw new MediaOperationError(
					400,
					"Direct upload is only supported with the local storage adapter",
					"DIRECT_UPLOAD_UNSUPPORTED",
				);
			}
			let uploadedUrl: string | undefined;
			try {
				return await adapter.transaction(async (tx) => {
					const folder = folders.get(context.input as object);
					await verifyFolder(tx, folder);
					const folderClaim = folder
						? await claimFolder(tx, folder)
						: undefined;
					await runDomainHook(
						() =>
							hooks?.onBeforeUpload?.(
								{
									filename: context.input.filename,
									mimeType: context.input.mimeType,
									size: context.input.size,
								},
								hookContext(context, { body: context.input }),
							),
						"UPLOAD_REJECTED",
					);
					validateMimeType(context.input.mimeType, allowedMimeTypes);
					validateSize(context.input.size, maxFileSizeBytes);
					const buffer = Buffer.from(context.input.contentBase64, "base64");
					if (buffer.byteLength !== context.input.size) {
						throw new MediaOperationError(
							400,
							"Uploaded file size does not match its bytes",
							"INVALID_UPLOAD_SIZE",
						);
					}
					const { url } = await storageAdapter.upload(buffer, {
						filename: context.input.filename,
						mimeType: context.input.mimeType,
						size: context.input.size,
						...(folder ? { folderId: folder.id } : {}),
					});
					uploadedUrl = url;
					const asset = await createAsset(tx, {
						filename: url.split("/").pop() ?? context.input.filename,
						originalName: context.input.filename,
						mimeType: context.input.mimeType,
						size: context.input.size,
						url,
						...(folder ? { folderId: folder.id } : {}),
						tenantId: tenants.get(context.input as object),
					});
					if (folder && folderClaim)
						await restoreFolder(tx, folder, folderClaim);
					return operationAsset(asset);
				});
			} catch (error) {
				if (uploadedUrl) {
					try {
						await storageAdapter.delete(uploadedUrl);
					} catch (cleanupError) {
						console.error(
							`[btst/media] Failed to clean up orphaned storage file after operation failure: ${uploadedUrl}`,
							cleanupError,
						);
					}
				}
				throw error;
			}
		},
		after: ((context: any) =>
			hooks?.onAfterUpload?.(
				context.result,
				hookContext(context, { body: context.input }) as MediaApiResultContext<
					z.output<typeof DirectUploadOperationInputSchema>,
					AssetUploadFacts,
					SerializedAsset
				>,
			)) as any,
		onError: ({ error, ...context }) => {
			markMemoryRollback(adapter, error);
			return notifyError(hooks?.onOperationError, error, context, {
				body: context.input,
			});
		},
	});

	const uploadTokenOperation = defineOperation({
		input: uploadTokenRequestSchema,
		permission: mediaPermissions.asset.upload,
		facts: async ({ input, request }) => {
			const tenantId = await resolveTenant(input as object, request, {
				body: input,
			});
			const folder = await loadFolder(input.folderId, tenantId);
			const effectiveTenantId = bindFolderTenant(
				input as object,
				tenantId,
				folder,
			);
			folders.set(input as object, folder);
			return {
				phase: "initialize" as const,
				...(folder ? { folderId: folder.id } : {}),
				mimeType: input.mimeType,
				...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
			} satisfies AssetUploadFacts;
		},
		execute: async (context) => {
			if (!isS3Adapter(storageAdapter)) {
				throw new MediaOperationError(
					400,
					"Upload token endpoint is only supported with the S3 storage adapter",
					"UPLOAD_TOKEN_UNSUPPORTED",
				);
			}
			const folder = folders.get(context.input as object);
			const issueToken = async () => {
				await runDomainHook(
					() =>
						hooks?.onBeforeUpload?.(
							{
								filename: context.input.filename,
								mimeType: context.input.mimeType,
								size: context.input.size,
							},
							hookContext(context, { body: context.input }),
						),
					"UPLOAD_REJECTED",
				);
				validateMimeType(context.input.mimeType, allowedMimeTypes);
				validateSize(context.input.size, maxFileSizeBytes);
				return operationUploadToken(
					await storageAdapter.generateUploadToken({
						filename: sanitizeS3KeySegment(context.input.filename),
						mimeType: context.input.mimeType,
						size: context.input.size,
						...(folder ? { folderId: folder.id } : {}),
					}),
				);
			};
			if (!folder) return issueToken();
			requireAtomicTransactions(adapter);
			return adapter.transaction(async (tx) => {
				await verifyFolder(tx, folder);
				const claimedAt = await claimFolder(tx, folder);
				const token = await issueToken();
				await restoreFolder(tx, folder, claimedAt);
				return token;
			});
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks?.onOperationError, error, context, {
				body: context.input,
			}),
	});

	const uploadVercelBlobOperation = defineOperation({
		input: VercelBlobOperationInputSchema,
		permission: mediaPermissions.asset.upload,
		facts: async ({ input, request }) => {
			if (!isVercelBlobAdapter(storageAdapter)) {
				throw new MediaOperationError(
					400,
					"Vercel Blob endpoint is only supported with the vercelBlobAdapter",
					"VERCEL_BLOB_UNSUPPORTED",
				);
			}
			if ("type" in input.body && input.body.type === "blob.upload-completed") {
				if (!request)
					throw new TypeError("Vercel Blob callbacks require a request.");
				let verified: Awaited<ReturnType<typeof storageAdapter.verifyCallback>>;
				try {
					verified = await storageAdapter.verifyCallback(
						request,
						input.body as unknown as VercelBlobUploadCompletedBody,
					);
				} catch {
					throw new MediaOperationError(
						401,
						"Invalid Vercel Blob provider callback.",
						"INVALID_PROVIDER_CALLBACK",
					);
				}
				const context = {
					phase: "callback" as const,
					filename: verified.pathname.split("/").pop() ?? verified.pathname,
					...verified,
				};
				vercelContexts.set(input as object, context);
				return {
					phase: "callback" as const,
					...(verified.folderId ? { folderId: verified.folderId } : {}),
					mimeType: verified.mimeType,
					...(verified.tenantId ? { tenantId: verified.tenantId } : {}),
				} satisfies AssetUploadFacts;
			}
			const normalized = parseVercelInitialize(input.body);
			const tenantId = await resolveTenant(input as object, request, {
				body: input.body,
			});
			const folder = await loadFolder(normalized.folderId, tenantId);
			const effectiveTenantId = bindFolderTenant(
				input as object,
				tenantId,
				folder,
			);
			folders.set(input as object, folder);
			const context = {
				phase: "initialize" as const,
				...normalized,
				...(folder ? { folderId: folder.id } : {}),
				...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
			};
			vercelContexts.set(input as object, context);
			return {
				phase: "initialize" as const,
				...(folder ? { folderId: folder.id } : {}),
				mimeType: normalized.mimeType,
				...(effectiveTenantId ? { tenantId: effectiveTenantId } : {}),
			} satisfies AssetUploadFacts;
		},
		execute: async (context) => {
			if (!isVercelBlobAdapter(storageAdapter) || !context.request) {
				throw new TypeError(
					"Vercel Blob execution requires its configured adapter and request.",
				);
			}
			const request = context.request;
			const upload = vercelContexts.get(context.input as object);
			if (!upload) throw staleStateError();
			const handleProviderRequest = async () => {
				if (upload.phase === "initialize") {
					await runDomainHook(
						() =>
							hooks?.onBeforeUpload?.(
								{
									filename: upload.filename,
									mimeType: upload.mimeType,
									size: upload.size,
								},
								hookContext(context, { body: context.input.body }),
							),
						"UPLOAD_REJECTED",
					);
					validateMimeType(upload.mimeType, allowedMimeTypes);
					if (upload.size !== undefined)
						validateSize(upload.size, maxFileSizeBytes);
				}
				const response = await storageAdapter.handleRequest(
					request,
					context.input.body as unknown as VercelBlobHandleUploadBody,
					{
						onBeforeGenerateToken: async (pathname) => {
							if (
								upload.phase !== "initialize" ||
								pathname !== upload.pathname
							) {
								throw staleStateError();
							}
							return {
								addRandomSuffix: true,
								allowedContentTypes: allowedMimeTypes?.length
									? allowedMimeTypes
									: undefined,
								maximumSizeInBytes: maxFileSizeBytes,
								tokenPayload: JSON.stringify({
									version: 1,
									pathname: upload.pathname,
									mimeType: upload.mimeType,
									...(upload.size !== undefined ? { size: upload.size } : {}),
									...(upload.folderId ? { folderId: upload.folderId } : {}),
									...(upload.tenantId ? { tenantId: upload.tenantId } : {}),
								}),
							};
						},
					},
				);
				return plainStorageResult(response);
			};
			if (upload.phase === "initialize") {
				const folder = folders.get(context.input as object);
				if (folder) {
					requireAtomicTransactions(adapter);
					return adapter.transaction(async (tx) => {
						await verifyFolder(tx, folder);
						const claimedAt = await claimFolder(tx, folder);
						const response = await handleProviderRequest();
						await restoreFolder(tx, folder, claimedAt);
						return response;
					});
				}
			}
			return handleProviderRequest();
		},
		onError: ({ error, ...context }) =>
			notifyError(hooks?.onOperationError, error, context, {
				body: context.input.body,
			}),
	});

	return {
		listAssets: listAssetsOperation,
		createAsset: createAssetOperation,
		updateAsset: updateAssetOperation,
		deleteAsset: deleteAssetOperation,
		listFolders: listFoldersOperation,
		createFolder: createFolderOperation,
		deleteFolder: deleteFolderOperation,
		uploadDirect: uploadDirectOperation,
		uploadToken: uploadTokenOperation,
		uploadVercelBlob: uploadVercelBlobOperation,
	};
}
