import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type { z } from "zod";
import type { listDuplicatesSchema } from "../schemas";
import type {
	Company,
	CompanyRecord,
	Contact,
	ContactRecord,
	CrmMergeRelation,
	DuplicateSuggestions,
	MergeEntity,
	MergePreview,
} from "../types";
import { serializeCompany, serializeContact } from "./serializers";

/** Read/write adapter shape shared by the outer adapter and transaction-scoped adapter. */
export type CrmDataAdapter = Omit<Adapter, "transaction">;
const contactFields = [
	"firstName",
	"lastName",
	"email",
	"phone",
	"company",
	"companyId",
	"title",
	"notes",
	"tags",
] as const;
const companyFields = ["name", "domain", "phone", "notes"] as const;
export const crmMergeModel = (entity: MergeEntity) =>
	entity === "contact" ? "crmContact" : "crmCompany";

export async function requireMergeRecord(
	adapter: CrmDataAdapter,
	entity: MergeEntity,
	id: string,
) {
	const record = await adapter.findOne<ContactRecord | CompanyRecord>({
		model: crmMergeModel(entity),
		where: [{ field: "id", value: id, operator: "eq" }],
	});
	if (!record)
		throw new OperationHttpError(
			404,
			`${entity === "contact" ? "Contact" : "Company"} not found`,
			"CRM_NOT_FOUND",
		);
	return record;
}

export function serializeMergeRecord(
	entity: MergeEntity,
	record: ContactRecord | CompanyRecord,
) {
	return entity === "contact"
		? serializeContact(record as ContactRecord)
		: serializeCompany(record as CompanyRecord);
}

/** Bounded indexed suggestions: equality is evidence for review, never proven identity. */
export async function listCrmDuplicates(
	adapter: Adapter,
	entity: MergeEntity,
	query: z.output<typeof listDuplicatesSchema>,
): Promise<DuplicateSuggestions<Contact | Company>> {
	const anchor = await requireMergeRecord(adapter, entity, query.id);
	const field = entity === "contact" ? "normalizedEmail" : "normalizedDomain";
	const normalizedValue =
		entity === "contact"
			? (anchor as ContactRecord).normalizedEmail
			: (anchor as CompanyRecord).normalizedDomain;
	if (!normalizedValue)
		return {
			items: [],
			total: 0,
			normalizedValue: null,
			identityVerified: false,
		};
	const where = [
		{ field, value: normalizedValue, operator: "eq" as const },
		{ field: "id", value: query.id, operator: "ne" as const },
	];
	const [records, total] = await Promise.all([
		adapter.findMany<ContactRecord | CompanyRecord>({
			model: crmMergeModel(entity),
			where,
			limit: query.limit,
			offset: query.offset,
			sortBy: { field: "id", direction: "asc" },
		}),
		adapter.count({ model: crmMergeModel(entity), where }),
	]);
	return {
		items: records.map((row) => serializeMergeRecord(entity, row)),
		total,
		normalizedValue,
		identityVerified: false,
	};
}

export function getCrmMergeRelations(
	entity: MergeEntity,
	declared: readonly CrmMergeRelation[],
) {
	const builtIn: CrmMergeRelation[] =
		entity === "contact"
			? [
					{ entity, model: "crmDeal", field: "contactId" },
					{ entity, model: "crmActivity", field: "contactId" },
				]
			: [
					{ entity, model: "crmContact", field: "companyId" },
					{ entity, model: "crmDeal", field: "companyId" },
				];
	return [
		...new Map(
			[
				...builtIn,
				...declared.filter((relation) => relation.entity === entity),
			].map((relation) => [`${relation.model}.${relation.field}`, relation]),
		).values(),
	];
}

export const emptyMergeValue = (value: unknown) =>
	value == null || value === "";

/** Read the complete field plan and affected relationship counts without writing. */
export async function previewCrmMerge(
	adapter: CrmDataAdapter,
	entity: MergeEntity,
	input: { readonly survivorId: string; readonly sourceId: string },
	declared: readonly CrmMergeRelation[] = [],
): Promise<MergePreview<Contact | Company>> {
	if (input.survivorId === input.sourceId)
		throw new OperationHttpError(
			400,
			"Cannot merge a record into itself",
			"CRM_SELF_MERGE",
		);
	const survivorRecord = await requireMergeRecord(
		adapter,
		entity,
		input.survivorId,
	);
	const sourceRecord = await requireMergeRecord(
		adapter,
		entity,
		input.sourceId,
	);
	if (!survivorRecord.revision || !sourceRecord.revision)
		throw new OperationHttpError(
			503,
			"Run the CRM migration and revision backfill before merging.",
			"CRM_MIGRATION_REQUIRED",
		);
	const survivor = serializeMergeRecord(entity, survivorRecord);
	const source = serializeMergeRecord(entity, sourceRecord);
	const left = survivor as unknown as Record<
		string,
		string | string[] | null | undefined
	>;
	const right = source as unknown as Record<
		string,
		string | string[] | null | undefined
	>;
	const fields: MergePreview<Contact | Company>["fields"] = (
		entity === "contact" ? contactFields : companyFields
	).map((name) => ({
		name,
		survivorValue: left[name] ?? null,
		sourceValue: right[name] ?? null,
		conflict:
			name !== "tags" &&
			!emptyMergeValue(left[name]) &&
			!emptyMergeValue(right[name]) &&
			left[name] !== right[name],
	}));
	if (entity === "contact") {
		const a = (survivor as Contact).customFields;
		const b = (source as Contact).customFields;
		for (const key of [
			...new Set([...Object.keys(a), ...Object.keys(b)]),
		].sort())
			fields.push({
				name: `customFields.${key}`,
				survivorValue: Object.hasOwn(a, key) ? a[key]! : null,
				sourceValue: Object.hasOwn(b, key) ? b[key]! : null,
				conflict:
					Object.hasOwn(a, key) &&
					Object.hasOwn(b, key) &&
					!emptyMergeValue(a[key]) &&
					!emptyMergeValue(b[key]) &&
					a[key] !== b[key],
			});
	}
	const relationships = await Promise.all(
		getCrmMergeRelations(entity, declared).map(async ({ model, field }) => ({
			name: `${model}.${field}`,
			count: await adapter.count({
				model,
				where: [{ field, value: input.sourceId, operator: "eq" }],
			}),
		})),
	);
	return {
		survivor,
		source,
		versions: {
			survivor: survivorRecord.revision,
			source: sourceRecord.revision,
		},
		fields,
		relationships,
		warnings: [
			"Matching email or domain is a suggestion, not proof of identity. Review every conflict before merging.",
			"Source fields and pre-merge survivor fields are retained in the merge audit. Only declared database references are repointed; reconcile application JSON and external references before merging.",
		],
	};
}
