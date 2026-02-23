import type { Adapter } from "@btst/db";
import type {
	Form,
	FormSubmission,
	FormSubmissionWithForm,
	SerializedForm,
	SerializedFormSubmission,
	SerializedFormSubmissionWithData,
} from "../types";

/**
 * Serialize a Form for SSR/SSG use (convert dates to strings).
 */
export function serializeForm(form: Form): SerializedForm {
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
 * Serialize a FormSubmission for SSR/SSG use (convert dates to strings).
 */
export function serializeFormSubmission(
	submission: FormSubmission,
): SerializedFormSubmission {
	return {
		...submission,
		submittedAt: submission.submittedAt.toISOString(),
	};
}

/**
 * Serialize a FormSubmission with parsed data and joined Form.
 * If `submission.data` is corrupted JSON, `parsedData` is set to `null` rather
 * than throwing, so one bad row cannot crash the entire list or SSG build.
 */
export function serializeFormSubmissionWithData(
	submission: FormSubmissionWithForm,
): SerializedFormSubmissionWithData {
	let parsedData: Record<string, unknown> | null = null;
	try {
		parsedData = JSON.parse(submission.data);
	} catch {
		// Corrupted JSON — leave parsedData as null so callers can handle it
	}
	return {
		...serializeFormSubmission(submission),
		parsedData,
		form: submission.form ? serializeForm(submission.form) : undefined,
	};
}

/**
 * Retrieve all forms with optional status filter and pagination.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks (e.g. `onBeforeListForms`) are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param params - Optional filter/pagination parameters
 */
export async function getAllForms(
	adapter: Adapter,
	params?: { status?: string; limit?: number; offset?: number },
): Promise<{
	items: SerializedForm[];
	total: number;
	limit?: number;
	offset?: number;
}> {
	const whereConditions: Array<{
		field: string;
		value: string;
		operator: "eq";
	}> = [];

	if (params?.status) {
		whereConditions.push({
			field: "status",
			value: params.status,
			operator: "eq" as const,
		});
	}

	// TODO: remove cast once @btst/db types expose adapter.count()
	const total: number = await adapter.count({
		model: "form",
		where: whereConditions.length > 0 ? whereConditions : undefined,
	});

	const forms = await adapter.findMany<Form>({
		model: "form",
		where: whereConditions.length > 0 ? whereConditions : undefined,
		limit: params?.limit,
		offset: params?.offset,
		sortBy: { field: "createdAt", direction: "desc" },
	});

	return {
		items: forms.map(serializeForm),
		total,
		limit: params?.limit,
		offset: params?.offset,
	};
}

/**
 * Retrieve a single form by its slug.
 * Returns null if the form is not found.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 * @param slug - The form slug
 */
export async function getFormBySlug(
	adapter: Adapter,
	slug: string,
): Promise<SerializedForm | null> {
	const form = await adapter.findOne<Form>({
		model: "form",
		where: [{ field: "slug", value: slug, operator: "eq" as const }],
	});

	if (!form) {
		return null;
	}

	return serializeForm(form);
}

/**
 * Retrieve submissions for a form by form ID, with optional pagination.
 * Returns an empty result if the form does not exist.
 * Pure DB function — no hooks, no HTTP context. Safe for server-side use.
 *
 * @remarks **Security:** Authorization hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 * @param formId - The form ID
 * @param params - Optional pagination parameters
 */
export async function getFormSubmissions(
	adapter: Adapter,
	formId: string,
	params?: { limit?: number; offset?: number },
): Promise<{
	items: SerializedFormSubmissionWithData[];
	total: number;
	limit?: number;
	offset?: number;
}> {
	const form = await adapter.findOne<Form>({
		model: "form",
		where: [{ field: "id", value: formId, operator: "eq" as const }],
	});

	if (!form) {
		return {
			items: [],
			total: 0,
			limit: params?.limit,
			offset: params?.offset,
		};
	}

	// TODO: remove cast once @btst/db types expose adapter.count()
	const total: number = await adapter.count({
		model: "formSubmission",
		where: [{ field: "formId", value: formId, operator: "eq" as const }],
	});

	const submissions = await adapter.findMany<FormSubmissionWithForm>({
		model: "formSubmission",
		where: [{ field: "formId", value: formId, operator: "eq" as const }],
		limit: params?.limit,
		offset: params?.offset,
		sortBy: { field: "submittedAt", direction: "desc" },
		join: { form: true },
	});

	return {
		items: submissions.map(serializeFormSubmissionWithData),
		total,
		limit: params?.limit,
		offset: params?.offset,
	};
}
