import { z } from "zod";

export const AssetListQuerySchema = z.object({
	folderId: z.string().optional(),
	mimeType: z.string().optional(),
	query: z.string().optional(),
	offset: z.coerce.number().int().min(0).optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
	tenantId: z.string().optional(),
});

export const createAssetSchema = z.object({
	filename: z.string().min(1),
	originalName: z.string().min(1),
	mimeType: z.string().min(1),
	// Allow 0 for URL-registered assets where size is unknown at registration time.
	size: z.number().int().min(0),
	url: z.httpUrl(),
	folderId: z.string().optional(),
	alt: z.string().optional(),
	tenantId: z.string().optional(),
});

export const updateAssetSchema = z.object({
	alt: z.string().optional(),
	folderId: z.string().nullable().optional(),
});

export const createFolderSchema = z.object({
	name: z.string().min(1),
	parentId: z.string().optional(),
	tenantId: z.string().optional(),
});

export const uploadTokenRequestSchema = z.object({
	filename: z.string().min(1),
	mimeType: z.string().min(1),
	size: z.number().int().positive(),
	folderId: z.string().optional(),
	tenantId: z.string().optional(),
});
