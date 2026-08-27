import type { DBAdapter as Adapter } from "@btst/db";
import { DEFAULT_MAX_PAGE_SIZE } from "../schemas";
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

/** Case-insensitive match of a search term against a form's name and slug. */
function formMatchesSearch(form: SerializedForm, searchLower: string): boolean {
	return (
		form.name.toLowerCase().includes(searchLower) ||
		form.slug.toLowerCase().includes(searchLower)
	);
}

/**
 * Retrieve all forms with optional status filter, pagination, and free-text
 * search.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks (e.g. `onBeforeListForms`) are NOT
 * called. The caller is responsible for any access-control checks before
 * invoking this function.
 *
 * @param adapter - The database adapter
 * @param params - Optional filter/pagination parameters. `search` matches
 * case-insensitively against form names and slugs.
 */
export async function getAllForms(
	adapter: Adapter,
	params?: {
		status?: string;
		limit?: number;
		offset?: number;
		search?: string;
	},
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

	// Free-text search stays in-memory (the adapter contract only exposes
	// equality filters here); when searching, pagination happens after the
	// in-memory pass so `total` reflects the filtered set. The DB scan is
	// capped at DEFAULT_MAX_PAGE_SIZE to bound memory use; forms beyond the
	// cap are not searched.
	const search = params?.search?.trim();
	const needsInMemoryFilter = !!search;

	// TODO: remove cast once @btst/db types expose adapter.count()
	const dbTotal: number | undefined = !needsInMemoryFilter
		? await adapter.count({
				model: "form",
				where: whereConditions.length > 0 ? whereConditions : undefined,
			})
		: undefined;

	const forms = await adapter.findMany<Form>({
		model: "form",
		where: whereConditions.length > 0 ? whereConditions : undefined,
		limit: !needsInMemoryFilter ? params?.limit : DEFAULT_MAX_PAGE_SIZE,
		offset: !needsInMemoryFilter ? params?.offset : undefined,
		sortBy: { field: "createdAt", direction: "desc" },
	});

	let result = forms.map(serializeForm);

	if (needsInMemoryFilter) {
		const searchLower = search.toLowerCase();
		result = result.filter((form) => formMatchesSearch(form, searchLower));

		const total = result.length;
		const offset = params?.offset ?? 0;
		const limit = params?.limit;
		result = result.slice(
			offset,
			limit !== undefined ? offset + limit : undefined,
		);
		return {
			items: result,
			total,
			limit: params?.limit,
			offset: params?.offset,
		};
	}

	return {
		items: result,
		total: dbTotal ?? result.length,
		limit: params?.limit,
		offset: params?.offset,
	};
}

/**
 * Retrieve a single form by its ID (UUID).
 * Returns null if the form is not found.
 * Pure DB function — no hooks, no HTTP context. Safe for SSG and server-side use.
 *
 * @remarks **Security:** Authorization hooks are NOT called. The caller is
 * responsible for any access-control checks before invoking this function.
 *
 * @param adapter - The database adapter
 * @param id - The form UUID
 */
export async function getFormById(
	adapter: Adapter,
	id: string,
): Promise<SerializedForm | null> {
	const form = await adapter.findOne<Form>({
		model: "form",
		where: [{ field: "id", value: id, operator: "eq" as const }],
	});
	if (!form) return null;
	return serializeForm(form);
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
	adapter: Pick<Adapter, "findOne" | "findMany" | "count">,
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
