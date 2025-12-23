import { z } from "zod";

/**
 * Schema for listing forms with pagination
 */
export const listFormsQuerySchema = z.object({
	status: z.enum(["active", "inactive", "archived"]).optional(),
	limit: z.coerce.number().min(1).max(100).optional().default(20),
	offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * Schema for creating a form
 */
export const createFormSchema = z.object({
	name: z.string().min(1, "Name is required"),
	slug: z.string().min(1, "Slug is required"),
	description: z.string().optional(),
	schema: z.string().min(1, "Schema is required"),
	successMessage: z.string().optional(),
	redirectUrl: z.string().url().optional().or(z.literal("")),
	status: z
		.enum(["active", "inactive", "archived"])
		.optional()
		.default("active"),
});

/**
 * Schema for updating a form
 */
export const updateFormSchema = z.object({
	name: z.string().min(1, "Name is required").optional(),
	slug: z.string().min(1, "Slug is required").optional(),
	description: z.string().optional(),
	schema: z.string().min(1, "Schema is required").optional(),
	successMessage: z.string().optional(),
	redirectUrl: z.string().url().optional().or(z.literal("")),
	status: z.enum(["active", "inactive", "archived"]).optional(),
});

/**
 * Schema for form response
 */
export const formResponseSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	description: z.string().nullable().optional(),
	schema: z.string(),
	successMessage: z.string().nullable().optional(),
	redirectUrl: z.string().nullable().optional(),
	status: z.string(),
	createdBy: z.string().nullable().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
});

/**
 * Schema for paginated forms response
 */
export const paginatedFormsResponseSchema = z.object({
	items: z.array(formResponseSchema),
	total: z.number(),
	limit: z.number(),
	offset: z.number(),
});

/**
 * Schema for listing form submissions with pagination
 */
export const listSubmissionsQuerySchema = z.object({
	limit: z.coerce.number().min(1).max(100).optional().default(20),
	offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * Schema for submitting a form (public)
 */
export const submitFormSchema = z.object({
	// Use passthrough object for dynamic form data validation
	data: z.object({}).passthrough(),
});

/**
 * Schema for form submission response
 */
export const formSubmissionResponseSchema = z.object({
	id: z.string(),
	formId: z.string(),
	data: z.string(),
	submittedAt: z.string(),
	submittedBy: z.string().nullable().optional(),
	ipAddress: z.string().nullable().optional(),
	userAgent: z.string().nullable().optional(),
});

/**
 * Schema for form submission with parsed data response
 */
export const formSubmissionWithDataResponseSchema =
	formSubmissionResponseSchema.extend({
		// Use passthrough object for dynamic parsed data
		parsedData: z.object({}).passthrough(),
		form: formResponseSchema.optional(),
	});

/**
 * Schema for paginated submissions response
 */
export const paginatedSubmissionsResponseSchema = z.object({
	items: z.array(formSubmissionWithDataResponseSchema),
	total: z.number(),
	limit: z.number(),
	offset: z.number(),
});

// Export inferred types
export type ListFormsQuery = z.infer<typeof listFormsQuerySchema>;
export type CreateFormInput = z.infer<typeof createFormSchema>;
export type UpdateFormInput = z.infer<typeof updateFormSchema>;
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
export type SubmitFormInput = z.infer<typeof submitFormSchema>;
