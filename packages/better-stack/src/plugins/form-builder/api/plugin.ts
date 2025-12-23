import type { Adapter } from "@btst/db";
import { defineBackendPlugin } from "@btst/stack/plugins/api";
import { createEndpoint } from "@btst/stack/plugins/api";
import { z } from "zod";
import { formBuilderSchema as dbSchema } from "../db";
import type {
	Form,
	FormSubmission,
	FormSubmissionWithForm,
	FormBuilderBackendConfig,
	FormBuilderHookContext,
	SubmissionHookContext,
	SerializedForm,
	SerializedFormSubmission,
	SerializedFormSubmissionWithData,
	FormInput,
	FormUpdate,
} from "../types";
import {
	listFormsQuerySchema,
	createFormSchema,
	updateFormSchema,
	listSubmissionsQuerySchema,
} from "../schemas";
import { slugify, extractIpAddress, extractUserAgent } from "../utils";

/**
 * Serialize a Form for API response (convert dates to strings)
 */
function serializeForm(form: Form): SerializedForm {
	return {
		id: form.id,
		name: form.name,
		slug: form.slug,
		description: form.description,
		schema: form.schema,
		successMessage: form.successMessage,
		redirectUrl: form.redirectUrl,
		status: form.status,
		createdBy: form.createdBy,
		createdAt: form.createdAt.toISOString(),
		updatedAt: form.updatedAt.toISOString(),
	};
}

/**
 * Serialize a FormSubmission for API response (convert dates to strings)
 */
function serializeFormSubmission(
	submission: FormSubmission,
): SerializedFormSubmission {
	return {
		...submission,
		submittedAt: submission.submittedAt.toISOString(),
	};
}

/**
 * Serialize a FormSubmission with parsed data and joined Form
 */
function serializeFormSubmissionWithData(
	submission: FormSubmissionWithForm,
): SerializedFormSubmissionWithData {
	return {
		...serializeFormSubmission(submission),
		parsedData: JSON.parse(submission.data),
		form: submission.form ? serializeForm(submission.form) : undefined,
	};
}

/**
 * Form Builder backend plugin
 * Provides API endpoints for managing forms and form submissions
 *
 * @param config - Configuration with optional hooks
 */
export const formBuilderBackendPlugin = (
	config: FormBuilderBackendConfig = {},
) =>
	defineBackendPlugin({
		name: "form-builder",

		dbPlugin: dbSchema,

		routes: (adapter: Adapter) => {
			// Helper to create hook context from request
			const createContext = (headers?: Headers): FormBuilderHookContext => ({
				headers,
				ipAddress: extractIpAddress(headers),
				userAgent: extractUserAgent(headers),
			});

			// Helper to create submission hook context
			const createSubmissionContext = (
				formSlug: string,
				formId: string,
				headers?: Headers,
			): SubmissionHookContext => ({
				...createContext(headers),
				formSlug,
				formId,
			});

			// ========== Form CRUD Endpoints (Admin) ==========

			const listForms = createEndpoint(
				"/forms",
				{
					method: "GET",
					query: listFormsQuerySchema,
				},
				async (ctx) => {
					const { status, limit, offset } = ctx.query;
					const context = createContext(ctx.headers);

					// Call before hook for auth check
					if (config.hooks?.onBeforeListForms) {
						const canList = await config.hooks.onBeforeListForms(context);
						if (!canList) {
							throw ctx.error(403, { message: "Access denied" });
						}
					}

					const whereConditions: Array<{
						field: string;
						value: string;
						operator: "eq";
					}> = [];
					if (status) {
						whereConditions.push({
							field: "status",
							value: status,
							operator: "eq" as const,
						});
					}

					// Get total count
					const allForms = await adapter.findMany<Form>({
						model: "form",
						where: whereConditions.length > 0 ? whereConditions : undefined,
					});
					const total = allForms.length;

					// Get paginated forms
					const forms = await adapter.findMany<Form>({
						model: "form",
						where: whereConditions.length > 0 ? whereConditions : undefined,
						limit,
						offset,
						sortBy: { field: "createdAt", direction: "desc" },
					});

					return {
						items: forms.map(serializeForm),
						total,
						limit,
						offset,
					};
				},
			);

			const getFormBySlug = createEndpoint(
				"/forms/:slug",
				{
					method: "GET",
					params: z.object({ slug: z.string() }),
				},
				async (ctx) => {
					const { slug } = ctx.params;
					const context = createContext(ctx.headers);

					// Call before hook for access check
					if (config.hooks?.onBeforeGetForm) {
						const canGet = await config.hooks.onBeforeGetForm(slug, context);
						if (!canGet) {
							throw ctx.error(403, { message: "Access denied" });
						}
					}

					const form = await adapter.findOne<Form>({
						model: "form",
						where: [{ field: "slug", value: slug, operator: "eq" as const }],
					});

					if (!form) {
						throw ctx.error(404, { message: "Form not found" });
					}

					return serializeForm(form);
				},
			);

			const getFormById = createEndpoint(
				"/forms/id/:id",
				{
					method: "GET",
					params: z.object({ id: z.string() }),
				},
				async (ctx) => {
					const { id } = ctx.params;
					const context = createContext(ctx.headers);

					// Call before hook for access check
					if (config.hooks?.onBeforeGetForm) {
						const canGet = await config.hooks.onBeforeGetForm(id, context);
						if (!canGet) {
							throw ctx.error(403, { message: "Access denied" });
						}
					}

					const form = await adapter.findOne<Form>({
						model: "form",
						where: [{ field: "id", value: id, operator: "eq" as const }],
					});

					if (!form) {
						throw ctx.error(404, { message: "Form not found" });
					}

					return serializeForm(form);
				},
			);

			const createForm = createEndpoint(
				"/forms",
				{
					method: "POST",
					body: createFormSchema,
				},
				async (ctx) => {
					const body = ctx.body;
					const context = createContext(ctx.headers);

					// Sanitize slug to ensure it's URL-safe
					const slug = slugify(body.slug);

					if (!slug) {
						throw ctx.error(400, {
							message:
								"Invalid slug: must contain at least one alphanumeric character",
						});
					}

					// Check for duplicate slug
					const existing = await adapter.findOne<Form>({
						model: "form",
						where: [{ field: "slug", value: slug, operator: "eq" as const }],
					});
					if (existing) {
						throw ctx.error(409, {
							message: "Form with this slug already exists",
						});
					}

					// Validate JSON Schema
					try {
						JSON.parse(body.schema);
					} catch {
						throw ctx.error(400, { message: "Invalid JSON Schema" });
					}

					// Build form input
					let formInput: FormInput = {
						name: body.name,
						slug,
						description: body.description,
						schema: body.schema,
						successMessage: body.successMessage,
						redirectUrl: body.redirectUrl || undefined,
						status: body.status as "active" | "inactive" | "archived",
					};

					// Call before hook - may modify data or deny operation
					if (config.hooks?.onBeforeFormCreated) {
						const result = await config.hooks.onBeforeFormCreated(
							formInput,
							context,
						);
						if (result === false) {
							throw ctx.error(403, { message: "Create operation denied" });
						}
						if (result && typeof result === "object") {
							formInput = result;
						}
					}

					const form = await adapter.create<Form>({
						model: "form",
						data: {
							name: formInput.name,
							slug: formInput.slug,
							description: formInput.description,
							schema: formInput.schema,
							successMessage: formInput.successMessage,
							redirectUrl: formInput.redirectUrl,
							status: formInput.status || "active",
							createdBy: formInput.createdBy,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});

					const serialized = serializeForm(form as Form);

					// Call after hook
					if (config.hooks?.onAfterFormCreated) {
						await config.hooks.onAfterFormCreated(serialized, context);
					}

					return serialized;
				},
			);

			const updateForm = createEndpoint(
				"/forms/:id",
				{
					method: "PUT",
					params: z.object({ id: z.string() }),
					body: updateFormSchema,
				},
				async (ctx) => {
					const { id } = ctx.params;
					const body = ctx.body;
					const context = createContext(ctx.headers);

					const existing = await adapter.findOne<Form>({
						model: "form",
						where: [{ field: "id", value: id, operator: "eq" as const }],
					});

					if (!existing) {
						throw ctx.error(404, { message: "Form not found" });
					}

					// Sanitize slug if provided
					let slug: string | undefined;
					if (body.slug) {
						slug = slugify(body.slug);
						if (!slug) {
							throw ctx.error(400, {
								message:
									"Invalid slug: must contain at least one alphanumeric character",
							});
						}

						// Check for duplicate slug if changing
						if (slug !== existing.slug) {
							const duplicate = await adapter.findOne<Form>({
								model: "form",
								where: [
									{ field: "slug", value: slug, operator: "eq" as const },
								],
							});
							if (duplicate) {
								throw ctx.error(409, {
									message: "Form with this slug already exists",
								});
							}
						}
					}

					// Validate JSON Schema if provided
					if (body.schema) {
						try {
							JSON.parse(body.schema);
						} catch {
							throw ctx.error(400, { message: "Invalid JSON Schema" });
						}
					}

					// Build update input
					let updateInput: FormUpdate = {
						name: body.name,
						slug,
						description: body.description,
						schema: body.schema,
						successMessage: body.successMessage,
						redirectUrl: body.redirectUrl,
						status: body.status as
							| "active"
							| "inactive"
							| "archived"
							| undefined,
					};

					// Call before hook - may modify data or deny operation
					if (config.hooks?.onBeforeFormUpdated) {
						const result = await config.hooks.onBeforeFormUpdated(
							id,
							updateInput,
							context,
						);
						if (result === false) {
							throw ctx.error(403, { message: "Update operation denied" });
						}
						if (result && typeof result === "object") {
							updateInput = result;
						}
					}

					// Build update data
					const updateData: Partial<Form> = {
						updatedAt: new Date(),
					};
					if (updateInput.name) updateData.name = updateInput.name;
					if (updateInput.slug) updateData.slug = updateInput.slug;
					if (updateInput.description !== undefined)
						updateData.description = updateInput.description;
					if (updateInput.schema) updateData.schema = updateInput.schema;
					if (updateInput.successMessage !== undefined)
						updateData.successMessage = updateInput.successMessage;
					if (updateInput.redirectUrl !== undefined)
						updateData.redirectUrl = updateInput.redirectUrl;
					if (updateInput.status) updateData.status = updateInput.status;

					await adapter.update({
						model: "form",
						where: [{ field: "id", value: id, operator: "eq" as const }],
						update: updateData,
					});

					const updated = await adapter.findOne<Form>({
						model: "form",
						where: [{ field: "id", value: id, operator: "eq" as const }],
					});

					if (!updated) {
						throw ctx.error(500, { message: "Failed to fetch updated form" });
					}

					const serialized = serializeForm(updated);

					// Call after hook
					if (config.hooks?.onAfterFormUpdated) {
						await config.hooks.onAfterFormUpdated(serialized, context);
					}

					return serialized;
				},
			);

			const deleteForm = createEndpoint(
				"/forms/:id",
				{
					method: "DELETE",
					params: z.object({ id: z.string() }),
				},
				async (ctx) => {
					const { id } = ctx.params;
					const context = createContext(ctx.headers);

					const existing = await adapter.findOne<Form>({
						model: "form",
						where: [{ field: "id", value: id, operator: "eq" as const }],
					});

					if (!existing) {
						throw ctx.error(404, { message: "Form not found" });
					}

					// Call before hook
					if (config.hooks?.onBeforeFormDeleted) {
						const canDelete = await config.hooks.onBeforeFormDeleted(
							id,
							context,
						);
						if (!canDelete) {
							throw ctx.error(403, { message: "Delete operation denied" });
						}
					}

					// Delete associated submissions first (cascade)
					await adapter.delete({
						model: "formSubmission",
						where: [{ field: "formId", value: id, operator: "eq" as const }],
					});

					await adapter.delete({
						model: "form",
						where: [{ field: "id", value: id, operator: "eq" as const }],
					});

					// Call after hook
					if (config.hooks?.onAfterFormDeleted) {
						await config.hooks.onAfterFormDeleted(id, context);
					}

					return { success: true };
				},
			);

			// ========== Form Submission Endpoints ==========

			const submitForm = createEndpoint(
				"/forms/:slug/submit",
				{
					method: "POST",
					params: z.object({ slug: z.string() }),
					body: z.object({
						// Use passthrough object for dynamic form data
						data: z.object({}).passthrough(),
					}),
				},
				async (ctx) => {
					const { slug } = ctx.params;
					const { data } = ctx.body;
					const baseContext = createContext(ctx.headers);

					// Get form by slug
					const form = await adapter.findOne<Form>({
						model: "form",
						where: [{ field: "slug", value: slug, operator: "eq" as const }],
					});

					if (!form) {
						throw ctx.error(404, { message: "Form not found" });
					}

					// Check if form is active
					if (form.status !== "active") {
						throw ctx.error(400, {
							message: "Form is not accepting submissions",
						});
					}

					const submissionContext = createSubmissionContext(
						slug,
						form.id,
						ctx.headers,
					);

					// Validate data against form schema
					try {
						const jsonSchema = JSON.parse(form.schema);
						const zodSchema = z.fromJSONSchema(jsonSchema);
						const validation = zodSchema.safeParse(data);
						if (!validation.success) {
							throw ctx.error(400, {
								message: "Validation failed",
								errors: validation.error.issues,
							});
						}
					} catch (error) {
						if (error && typeof error === "object" && "code" in error) {
							throw error; // Re-throw API errors
						}
						throw ctx.error(400, { message: "Invalid form data" });
					}

					// Call before submission hook - may modify data or deny
					let finalData = data as Record<string, unknown>;
					if (config.hooks?.onBeforeSubmission) {
						try {
							const result = await config.hooks.onBeforeSubmission(
								slug,
								data as Record<string, unknown>,
								submissionContext,
							);
							if (result === false) {
								throw ctx.error(400, { message: "Submission rejected" });
							}
							if (result && typeof result === "object") {
								finalData = result;
							}
						} catch (error) {
							// Call error hook if submission is rejected
							if (config.hooks?.onSubmissionError) {
								await config.hooks.onSubmissionError(
									error as Error,
									slug,
									data as Record<string, unknown>,
									submissionContext,
								);
							}
							throw error;
						}
					}

					// Create submission
					const submission = await adapter.create<FormSubmission>({
						model: "formSubmission",
						data: {
							formId: form.id,
							data: JSON.stringify(finalData),
							submittedAt: new Date(),
							ipAddress: baseContext.ipAddress,
							userAgent: baseContext.userAgent,
						},
					});

					const serialized = serializeFormSubmission(submission);

					// Call after submission hook
					if (config.hooks?.onAfterSubmission) {
						await config.hooks.onAfterSubmission(
							serialized,
							serializeForm(form),
							submissionContext,
						);
					}

					return {
						...serialized,
						form: {
							successMessage: form.successMessage,
							redirectUrl: form.redirectUrl,
						},
					};
				},
			);

			// ========== Submissions Management Endpoints (Admin) ==========

			const listSubmissions = createEndpoint(
				"/forms/:formId/submissions",
				{
					method: "GET",
					params: z.object({ formId: z.string() }),
					query: listSubmissionsQuerySchema,
				},
				async (ctx) => {
					const { formId } = ctx.params;
					const { limit, offset } = ctx.query;
					const context = createContext(ctx.headers);

					// Verify form exists
					const form = await adapter.findOne<Form>({
						model: "form",
						where: [{ field: "id", value: formId, operator: "eq" as const }],
					});

					if (!form) {
						throw ctx.error(404, { message: "Form not found" });
					}

					// Call before hook for auth check
					if (config.hooks?.onBeforeListSubmissions) {
						const canList = await config.hooks.onBeforeListSubmissions(
							formId,
							context,
						);
						if (!canList) {
							throw ctx.error(403, { message: "Access denied" });
						}
					}

					// Get total count
					const allSubmissions = await adapter.findMany<FormSubmission>({
						model: "formSubmission",
						where: [
							{ field: "formId", value: formId, operator: "eq" as const },
						],
					});
					const total = allSubmissions.length;

					// Get paginated submissions
					const submissions = await adapter.findMany<FormSubmissionWithForm>({
						model: "formSubmission",
						where: [
							{ field: "formId", value: formId, operator: "eq" as const },
						],
						limit,
						offset,
						sortBy: { field: "submittedAt", direction: "desc" },
						join: { form: true },
					});

					return {
						items: submissions.map(serializeFormSubmissionWithData),
						total,
						limit,
						offset,
					};
				},
			);

			const getSubmission = createEndpoint(
				"/forms/:formId/submissions/:subId",
				{
					method: "GET",
					params: z.object({ formId: z.string(), subId: z.string() }),
				},
				async (ctx) => {
					const { formId, subId } = ctx.params;
					const context = createContext(ctx.headers);

					// Call before hook for access check
					if (config.hooks?.onBeforeGetSubmission) {
						const canGet = await config.hooks.onBeforeGetSubmission(
							subId,
							context,
						);
						if (!canGet) {
							throw ctx.error(403, { message: "Access denied" });
						}
					}

					const submission = await adapter.findOne<FormSubmissionWithForm>({
						model: "formSubmission",
						where: [{ field: "id", value: subId, operator: "eq" as const }],
						join: { form: true },
					});

					if (!submission || submission.formId !== formId) {
						throw ctx.error(404, { message: "Submission not found" });
					}

					return serializeFormSubmissionWithData(submission);
				},
			);

			const deleteSubmission = createEndpoint(
				"/forms/:formId/submissions/:subId",
				{
					method: "DELETE",
					params: z.object({ formId: z.string(), subId: z.string() }),
				},
				async (ctx) => {
					const { formId, subId } = ctx.params;
					const context = createContext(ctx.headers);

					const existing = await adapter.findOne<FormSubmission>({
						model: "formSubmission",
						where: [{ field: "id", value: subId, operator: "eq" as const }],
					});

					if (!existing || existing.formId !== formId) {
						throw ctx.error(404, { message: "Submission not found" });
					}

					// Call before hook
					if (config.hooks?.onBeforeSubmissionDeleted) {
						const canDelete = await config.hooks.onBeforeSubmissionDeleted(
							subId,
							context,
						);
						if (!canDelete) {
							throw ctx.error(403, { message: "Delete operation denied" });
						}
					}

					await adapter.delete({
						model: "formSubmission",
						where: [{ field: "id", value: subId, operator: "eq" as const }],
					});

					// Call after hook
					if (config.hooks?.onAfterSubmissionDeleted) {
						await config.hooks.onAfterSubmissionDeleted(subId, context);
					}

					return { success: true };
				},
			);

			return {
				listForms,
				getFormBySlug,
				getFormById,
				createForm,
				updateForm,
				deleteForm,
				submitForm,
				listSubmissions,
				getSubmission,
				deleteSubmission,
			};
		},
	});

export type FormBuilderApiRouter = ReturnType<
	ReturnType<typeof formBuilderBackendPlugin>["routes"]
>;
