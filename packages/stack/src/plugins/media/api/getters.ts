import type { DBAdapter as Adapter } from "@btst/db";
import type { Asset, Folder } from "../types";

/**
 * Parameters for filtering and paginating the asset list.
 */
export interface AssetListParams {
	folderId?: string;
	mimeType?: string;
	query?: string;
	offset?: number;
	limit?: number;
	tenantId?: string;
}

/**
 * Paginated result returned by {@link listAssets}.
 */
export interface AssetListResult {
	items: Asset[];
	total: number;
	limit?: number;
	offset?: number;
}

/**
 * Parameters for filtering the folder list.
 */
export interface FolderListParams {
	parentId?: string | null;
	tenantId?: string;
}

/**
 * Retrieve all assets matching optional filter criteria.
 * Pure DB function — no hooks, no HTTP context. Safe for server-side use.
 *
 * @remarks **Security:** Authorization hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 */
export async function listAssets(
	adapter: Adapter,
	params?: AssetListParams,
): Promise<AssetListResult> {
	const query = params ?? {};

	const whereConditions: Array<{
		field: string;
		value: string | number | boolean | string[] | number[] | Date | null;
		operator: "eq" | "in";
	}> = [];

	if (query.folderId !== undefined) {
		whereConditions.push({
			field: "folderId",
			value: query.folderId,
			operator: "eq" as const,
		});
	}

	if (query.mimeType) {
		whereConditions.push({
			field: "mimeType",
			value: query.mimeType,
			operator: "eq" as const,
		});
	}

	if (query.tenantId !== undefined) {
		whereConditions.push({
			field: "tenantId",
			value: query.tenantId,
			operator: "eq" as const,
		});
	}

	const needsInMemoryFilter = !!query.query;
	const dbWhere = whereConditions.length > 0 ? whereConditions : undefined;

	const dbTotal: number | undefined = !needsInMemoryFilter
		? await adapter.count({ model: "mediaAsset", where: dbWhere })
		: undefined;

	let assets = await adapter.findMany<Asset>({
		model: "mediaAsset",
		limit: !needsInMemoryFilter ? query.limit : undefined,
		offset: !needsInMemoryFilter ? query.offset : undefined,
		where: dbWhere,
		sortBy: { field: "createdAt", direction: "desc" },
	});

	if (query.query) {
		const searchLower = query.query.toLowerCase();
		assets = assets.filter(
			(asset) =>
				asset.filename.toLowerCase().includes(searchLower) ||
				asset.originalName.toLowerCase().includes(searchLower) ||
				asset.alt?.toLowerCase().includes(searchLower),
		);
	}

	if (needsInMemoryFilter) {
		const total = assets.length;
		const offset = query.offset ?? 0;
		const limit = query.limit;
		assets = assets.slice(
			offset,
			limit !== undefined ? offset + limit : undefined,
		);
		return { items: assets, total, limit: query.limit, offset: query.offset };
	}

	return {
		items: assets,
		total: dbTotal ?? assets.length,
		limit: query.limit,
		offset: query.offset,
	};
}

/**
 * Retrieve a single asset by its ID.
 * Returns `null` if no asset is found.
 * Pure DB function — no hooks, no HTTP context.
 *
 * @remarks **Security:** Authorization hooks are NOT called.
 */
export async function getAssetById(
	adapter: Adapter,
	id: string,
): Promise<Asset | null> {
	return adapter.findOne<Asset>({
		model: "mediaAsset",
		where: [{ field: "id", value: id, operator: "eq" as const }],
	});
}

/**
 * Retrieve all folders, optionally filtered by `parentId`.
 * Pass `null` to list root-level folders (those without a parent).
 * Pure DB function — no hooks, no HTTP context.
 *
 * @remarks **Security:** Authorization hooks are NOT called.
 */
export async function listFolders(
	adapter: Adapter,
	params?: FolderListParams,
): Promise<Folder[]> {
	const whereConditions: Array<{
		field: string;
		value: string | null;
		operator: "eq";
	}> = [];

	if (params?.parentId !== undefined) {
		whereConditions.push({
			field: "parentId",
			value: params.parentId,
			operator: "eq" as const,
		});
	}

	if (params?.tenantId !== undefined) {
		whereConditions.push({
			field: "tenantId",
			value: params.tenantId,
			operator: "eq" as const,
		});
	}

	return adapter.findMany<Folder>({
		model: "mediaFolder",
		where: whereConditions.length > 0 ? whereConditions : undefined,
		sortBy: { field: "name", direction: "asc" },
	});
}

/**
 * Retrieve a single folder by its ID.
 * Returns `null` if no folder is found.
 * Pure DB function — no hooks, no HTTP context.
 *
 * @remarks **Security:** Authorization hooks are NOT called.
 */
export async function getFolderById(
	adapter: Adapter,
	id: string,
): Promise<Folder | null> {
	return adapter.findOne<Folder>({
		model: "mediaFolder",
		where: [{ field: "id", value: id, operator: "eq" as const }],
	});
}

/**
 * Find a single folder by name, optionally scoped to a specific parent and/or tenant.
 * Pass `null` for `parentId` to search only root-level folders.
 * Pass `undefined` for `parentId` to search regardless of parent.
 * Returns `null` if no matching folder is found.
 *
 * Pure DB function — no hooks, no HTTP context.
 * The caller is responsible for any access-control checks.
 */
export async function getFolderByName(
	adapter: Adapter,
	name: string,
	parentId?: string | null,
	tenantId?: string,
): Promise<Folder | null> {
	const where: Array<{
		field: string;
		value: string | null;
		operator: "eq";
	}> = [{ field: "name", value: name, operator: "eq" as const }];

	if (parentId !== undefined) {
		where.push({ field: "parentId", value: parentId, operator: "eq" as const });
	}

	if (tenantId !== undefined) {
		where.push({ field: "tenantId", value: tenantId, operator: "eq" as const });
	}

	return adapter.findOne<Folder>({ model: "mediaFolder", where });
}
