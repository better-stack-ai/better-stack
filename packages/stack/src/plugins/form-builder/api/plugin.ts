import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { formBuilderSchema as dbSchema } from "../db";
import {
	createFormSchema,
	listFormsQuerySchema,
	listSubmissionsQuerySchema,
	updateFormSchema,
} from "../schemas";
import type { FormBuilderBackendConfig } from "../types";
import {
	getAllForms,
	getFormById,
	getFormSubmissions,
	serializeFormSubmissionSummary,
} from "./getters";
import {
	GetFormByIdOperationInputSchema,
	GetFormForUpdateOperationInputSchema,
	GetFormBySlugOperationInputSchema,
	SubmitFormOperationInputSchema,
	createFormBuilderOperations,
} from "./operations";
import { FORM_QUERY_KEYS } from "./query-key-defs";

export {
	DeleteFormOperationInputSchema,
	GetFormByIdOperationInputSchema,
	GetFormForUpdateOperationInputSchema,
	GetFormBySlugOperationInputSchema,
	GetSubmissionOperationInputSchema,
	ListSubmissionsOperationInputSchema,
	SubmitFormOperationInputSchema,
	UpdateFormOperationInputSchema,
} from "./operations";

/** Route keys returned by the Form Builder client plugin. */
export type FormBuilderRouteKey =
	| "formList"
	| "newForm"
	| "editForm"
	| "submissions";

interface FormBuilderPrefetchForRoute {
	(key: "formList" | "newForm", qc: QueryClient): Promise<void>;
	(
		key: "editForm" | "submissions",
		qc: QueryClient,
		params: { id: string },
	): Promise<void>;
}

/**
 * Raw SSG path. It bypasses request authorization and seeds only the
 * route data selected by the caller. Protected static output needs equivalent
 * deployment-level access controls.
 */
function createFormBuilderPrefetchForRoute(
	adapter: Adapter,
): FormBuilderPrefetchForRoute {
	return async function prefetchForRoute(
		key: FormBuilderRouteKey,
		queryClient: QueryClient,
		params?: Record<string, string>,
	): Promise<void> {
		switch (key) {
			case "formList": {
				const result = await getAllForms(adapter, { limit: 20, offset: 0 });
				queryClient.setQueryData(
					FORM_QUERY_KEYS.formsList({ limit: 20, offset: 0 }),
					{
						pages: [
							{
								items: result.items,
								total: result.total,
								limit: result.limit ?? 20,
								offset: result.offset ?? 0,
							},
						],
						pageParams: [0],
					},
				);
				break;
			}
			case "editForm": {
				const id = params?.id ?? "";
				if (id) {
					queryClient.setQueryData(
						FORM_QUERY_KEYS.formForUpdate(id),
						await getFormById(adapter, id),
					);
				}
				break;
			}
			case "submissions": {
				const id = params?.id ?? "";
				if (id) {
					const [form, result] = await Promise.all([
						getFormById(adapter, id),
						getFormSubmissions(adapter, id, { limit: 20, offset: 0 }),
					]);
					const formContext = form
						? {
								id: form.id,
								name: form.name,
								...(form.createdBy ? { createdBy: form.createdBy } : {}),
							}
						: null;
					queryClient.setQueryData(
						FORM_QUERY_KEYS.submissionsList({
							formId: id,
							limit: 20,
							offset: 0,
						}),
						{
							pages: [
								{
									form: formContext,
									items: result.items.map(serializeFormSubmissionSummary),
									total: result.total,
									limit: result.limit ?? 20,
									offset: result.offset ?? 0,
								},
							],
							pageParams: [0],
						},
					);
				}
				break;
			}
			default:
				break;
		}
	} as FormBuilderPrefetchForRoute;
}

/** Form Builder backend plugin backed by one operation inventory. */
export const formBuilderBackendPlugin = (
	config: FormBuilderBackendConfig = {},
) =>
	defineBackendPlugin({
		id: "formBuilder",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) =>
			createFormBuilderOperations(adapter, config.hooks),

		/** Lower-level SSG helper that intentionally bypasses auth and hooks. */
		raw: (adapter: Adapter) => ({
			prefetchForRoute: createFormBuilderPrefetchForRoute(adapter),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			const listForms = createEndpoint(
				"/forms",
				{ method: "GET", query: listFormsQuerySchema, requireRequest: true },
				operations.listForms.route((ctx) => ctx.query),
			);
			const getFormBySlugEndpoint = createEndpoint(
				"/forms/:slug",
				{
					method: "GET",
					params: GetFormBySlugOperationInputSchema,
					requireRequest: true,
				},
				operations.getFormBySlug.route((ctx) => ctx.params),
			);
			const getFormByIdEndpoint = createEndpoint(
				"/forms/id/:id",
				{
					method: "GET",
					params: GetFormByIdOperationInputSchema,
					requireRequest: true,
				},
				operations.getFormById.route((ctx) => ctx.params),
			);
			const getFormForUpdateEndpoint = createEndpoint(
				"/forms/id/:id/edit",
				{
					method: "GET",
					params: GetFormForUpdateOperationInputSchema,
					requireRequest: true,
				},
				operations.getFormForUpdate.route((ctx) => ctx.params),
			);
			const createForm = createEndpoint(
				"/forms",
				{ method: "POST", body: createFormSchema, requireRequest: true },
				operations.createForm.route((ctx) => ctx.body),
			);
			const updateForm = createEndpoint(
				"/forms/:id",
				{ method: "PUT", body: updateFormSchema, requireRequest: true },
				operations.updateForm.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			);
			const deleteForm = createEndpoint(
				"/forms/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteForm.route((ctx) => ({ id: ctx.params.id })),
			);
			const submitForm = createEndpoint(
				"/forms/:slug/submit",
				{
					method: "POST",
					body: SubmitFormOperationInputSchema.pick({ data: true }),
					requireRequest: true,
				},
				operations.submitForm.route((ctx) => ({
					slug: ctx.params.slug,
					data: ctx.body.data,
				})),
			);
			const listSubmissions = createEndpoint(
				"/forms/:formId/submissions",
				{
					method: "GET",
					query: listSubmissionsQuerySchema,
					requireRequest: true,
				},
				operations.listSubmissions.route((ctx) => ({
					formId: ctx.params.formId,
					query: ctx.query,
				})),
			);
			const getSubmission = createEndpoint(
				"/forms/:formId/submissions/:subId",
				{ method: "GET", requireRequest: true },
				operations.getSubmission.route((ctx) => ({
					formId: ctx.params.formId,
					submissionId: ctx.params.subId,
				})),
			);
			const deleteSubmission = createEndpoint(
				"/forms/:formId/submissions/:subId",
				{ method: "DELETE", requireRequest: true },
				operations.deleteSubmission.route((ctx) => ({
					formId: ctx.params.formId,
					submissionId: ctx.params.subId,
				})),
			);

			return {
				listForms,
				getFormBySlug: getFormBySlugEndpoint,
				getFormById: getFormByIdEndpoint,
				getFormForUpdate: getFormForUpdateEndpoint,
				createForm,
				updateForm,
				deleteForm,
				submitForm,
				listSubmissions,
				getSubmission,
				deleteSubmission,
			} as const;
		},
	});

export type FormBuilderApiRouter = ReturnType<
	ReturnType<typeof formBuilderBackendPlugin>["routes"]
>;
