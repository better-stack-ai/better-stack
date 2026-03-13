import { z } from "zod";

export const CommentStatusSchema = z.enum(["pending", "approved", "spam"]);

// ============ Comment Schemas ============

/**
 * Schema for the POST /comments request body.
 * authorId is intentionally absent — the server resolves identity from the
 * session inside onBeforePost and injects it. Never trust authorId from the
 * client body.
 */
export const createCommentSchema = z.object({
	resourceId: z.string().min(1, "Resource ID is required"),
	resourceType: z.string().min(1, "Resource type is required"),
	parentId: z.string().optional().nullable(),
	body: z.string().min(1, "Body is required").max(10000, "Comment too long"),
});

/**
 * Internal schema used after the authorId has been resolved server-side.
 * This is what gets passed to createComment() in mutations.ts.
 */
export const createCommentInternalSchema = createCommentSchema.extend({
	authorId: z.string().min(1, "Author ID is required"),
});

export const updateCommentSchema = z.object({
	body: z.string().min(1, "Body is required").max(10000, "Comment too long"),
});

export const updateCommentStatusSchema = z.object({
	status: CommentStatusSchema,
});

// ============ Query Schemas ============

export const CommentListQuerySchema = z.object({
	resourceId: z.string().optional(),
	resourceType: z.string().optional(),
	parentId: z.string().optional().nullable(),
	status: CommentStatusSchema.optional(),
	currentUserId: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).optional(),
	offset: z.coerce.number().int().min(0).optional(),
});

export const CommentCountQuerySchema = z.object({
	resourceId: z.string().min(1),
	resourceType: z.string().min(1),
	status: CommentStatusSchema.optional(),
});
