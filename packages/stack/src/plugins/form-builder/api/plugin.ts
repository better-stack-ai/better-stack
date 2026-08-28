import type { DBAdapter as Adapter } from "@btst/db";
import { createEndpoint, defineBackendPlugin } from "@btst/stack/plugins/api";
import type { QueryClient } from "@tanstack/react-query";
import { AuthorizationError } from "../../../authorization/server";
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
	getFormBySlug,
	getFormSubmissions,
	serializeFormSubmissionSummary,
} from "./getters";
import {
	FormBuilderOperationError,
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
 * Trusted raw SSG path. It bypasses request authorization and seeds only the
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

type EndpointErrorFactory = (...args: any[]) => Error;

async function adaptOperationToHttp<TResult>(
	execute: () => Promise<TResult>,
	error: EndpointErrorFactory,
): Promise<TResult> {
	try {
		return await execute();
	} catch (cause) {
		if (
			cause instanceof AuthorizationError ||
			cause instanceof FormBuilderOperationError
		) {
			throw error(cause.statusCode, {
				message: cause.message,
				...(cause instanceof FormBuilderOperationError
					? {
							code: cause.code,
							...(cause.issues ? { issues: cause.issues } : {}),
						}
					: {}),
			});
		}
		throw cause;
	}
}

/** Form Builder backend plugin backed by one operation inventory. */
export const formBuilderBackendPlugin = (
	config: FormBuilderBackendConfig = {},
) =>
	defineBackendPlugin({
		name: "form-builder",
		dbPlugin: dbSchema,
		operations: (adapter: Adapter) =>
			createFormBuilderOperations(adapter, config.hooks),

		/** Lower-level server API that intentionally bypasses auth and hooks. */
		api: (adapter: Adapter) => ({
			getAllForms: (params?: Parameters<typeof getAllForms>[1]) =>
				getAllForms(adapter, params),
			getFormById: (id: string) => getFormById(adapter, id),
			getFormBySlug: (slug: string) => getFormBySlug(adapter, slug),
			getFormSubmissions: (
				formId: string,
				params?: Parameters<typeof getFormSubmissions>[2],
			) => getFormSubmissions(adapter, formId, params),
			prefetchForRoute: createFormBuilderPrefetchForRoute(adapter),
		}),

		routes: (_adapter: Adapter, _context, operations) => {
			const listForms = createEndpoint(
				"/forms",
				{ method: "GET", query: listFormsQuerySchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.listForms(ctx.query, ctx.request),
						ctx.error,
					),
			);
			const getFormBySlugEndpoint = createEndpoint(
				"/forms/:slug",
				{
					method: "GET",
					params: GetFormBySlugOperationInputSchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() => operations.getFormBySlug(ctx.params, ctx.request),
						ctx.error,
					),
			);
			const getFormByIdEndpoint = createEndpoint(
				"/forms/id/:id",
				{
					method: "GET",
					params: GetFormByIdOperationInputSchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() => operations.getFormById(ctx.params, ctx.request),
						ctx.error,
					),
			);
			const getFormForUpdateEndpoint = createEndpoint(
				"/forms/id/:id/edit",
				{
					method: "GET",
					params: GetFormForUpdateOperationInputSchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() => operations.getFormForUpdate(ctx.params, ctx.request),
						ctx.error,
					),
			);
			const createForm = createEndpoint(
				"/forms",
				{ method: "POST", body: createFormSchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.createForm(ctx.body, ctx.request),
						ctx.error,
					),
			);
			const updateForm = createEndpoint(
				"/forms/:id",
				{ method: "PUT", body: updateFormSchema, requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.updateForm(
								{ id: ctx.params.id, data: ctx.body },
								ctx.request,
							),
						ctx.error,
					),
			);
			const deleteForm = createEndpoint(
				"/forms/:id",
				{ method: "DELETE", requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() => operations.deleteForm({ id: ctx.params.id }, ctx.request),
						ctx.error,
					),
			);
			const submitForm = createEndpoint(
				"/forms/:slug/submit",
				{
					method: "POST",
					body: SubmitFormOperationInputSchema.pick({ data: true }),
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.submitForm(
								{ slug: ctx.params.slug, data: ctx.body.data },
								ctx.request,
							),
						ctx.error,
					),
			);
			const listSubmissions = createEndpoint(
				"/forms/:formId/submissions",
				{
					method: "GET",
					query: listSubmissionsQuerySchema,
					requireRequest: true,
				},
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.listSubmissions(
								{ formId: ctx.params.formId, query: ctx.query },
								ctx.request,
							),
						ctx.error,
					),
			);
			const getSubmission = createEndpoint(
				"/forms/:formId/submissions/:subId",
				{ method: "GET", requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.getSubmission(
								{
									formId: ctx.params.formId,
									submissionId: ctx.params.subId,
								},
								ctx.request,
							),
						ctx.error,
					),
			);
			const deleteSubmission = createEndpoint(
				"/forms/:formId/submissions/:subId",
				{ method: "DELETE", requireRequest: true },
				(ctx) =>
					adaptOperationToHttp(
						() =>
							operations.deleteSubmission(
								{
									formId: ctx.params.formId,
									submissionId: ctx.params.subId,
								},
								ctx.request,
							),
						ctx.error,
					),
			);

			return {
				listForms: operations.listForms.route(listForms),
				getFormBySlug: operations.getFormBySlug.route(getFormBySlugEndpoint),
				getFormById: operations.getFormById.route(getFormByIdEndpoint),
				getFormForUpdate: operations.getFormForUpdate.route(
					getFormForUpdateEndpoint,
				),
				createForm: operations.createForm.route(createForm),
				updateForm: operations.updateForm.route(updateForm),
				deleteForm: operations.deleteForm.route(deleteForm),
				submitForm: operations.submitForm.route(submitForm),
				listSubmissions: operations.listSubmissions.route(listSubmissions),
				getSubmission: operations.getSubmission.route(getSubmission),
				deleteSubmission: operations.deleteSubmission.route(deleteSubmission),
			} as const;
		},
	});

export type FormBuilderApiRouter = ReturnType<
	ReturnType<typeof formBuilderBackendPlugin>["routes"]
>;
