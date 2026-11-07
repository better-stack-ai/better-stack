import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type { DeepReadonly } from "@btst/stack/plugins/api";
import { createCompanySchema, createContactSchema } from "../schemas";
import type {
	Company,
	Contact,
	CrmMergeRelation,
	MergeEntity,
	MergeInput,
} from "../types";
import { normalizeCrmDomain, normalizeCrmEmail } from "./normalization";
import {
	crmMergeModel,
	emptyMergeValue,
	getCrmMergeRelations,
	previewCrmMerge,
	requireMergeRecord,
	serializeMergeRecord,
} from "./merge-getters";

const stale = () =>
	new OperationHttpError(
		409,
		"Records changed since preview. Review a fresh merge preview.",
		"CRM_STALE_MERGE",
	);

/** Lower-level write: callers own authorization. Requires isolated native transactions and scalar FK enforcement. */
export async function mergeCrmRecords(
	adapter: Adapter,
	entity: MergeEntity,
	input: DeepReadonly<MergeInput>,
	declared: readonly CrmMergeRelation[] = [],
): Promise<Contact | Company> {
	if (
		adapter.id === "memory" ||
		typeof adapter.options?.adapterConfig.transaction !== "function"
	)
		throw new OperationHttpError(
			503,
			"CRM merges require an adapter with isolated transaction support.",
			"ATOMIC_TRANSACTION_REQUIRED",
		);
	return adapter.transaction(async (tx) => {
		const preview = await previewCrmMerge(tx, entity, input, declared);
		if (
			preview.versions.survivor !== input.versions.survivor ||
			preview.versions.source !== input.versions.source
		)
			throw stale();
		if (preview.blockers.length)
			throw new OperationHttpError(
				400,
				preview.blockers.join(" "),
				"CRM_MERGE_BLOCKED",
			);
		const names = new Set(preview.fields.map((field) => field.name));
		if (Object.keys(input.choices).some((name) => !names.has(name)))
			throw new OperationHttpError(
				400,
				"Unknown merge field choice",
				"CRM_INVALID_MERGE_CHOICE",
			);
		for (const field of preview.fields)
			if (field.conflict && !Object.hasOwn(input.choices, field.name))
				throw new OperationHttpError(
					400,
					`Choose a value for ${field.name}`,
					"CRM_MERGE_CONFLICT",
				);
		// CAS writes acquire SQL row locks in the same order for both merge directions.
		for (const { id, revision } of [
			{ id: input.survivorId, revision: input.versions.survivor },
			{ id: input.sourceId, revision: input.versions.source },
		].sort((a, b) => a.id.localeCompare(b.id))) {
			const claimed = await tx.incrementOne({
				model: crmMergeModel(entity),
				where: [
					{ field: "id", value: id, operator: "eq" },
					{ field: "revision", value: revision, operator: "eq" },
				],
				increment: {},
				set: { revision: crypto.randomUUID() },
			});
			if (!claimed) throw stale();
		}
		const selected = Object.fromEntries(
			preview.fields.map((field) => [
				field.name,
				input.choices[field.name] === "source" ||
				(!input.choices[field.name] &&
					emptyMergeValue(field.survivorValue) &&
					field.sourceValue !== null)
					? field.sourceValue
					: field.survivorValue,
			]),
		);
		let data: Record<string, unknown>;
		if (entity === "contact") {
			const customFields = Object.fromEntries(
				preview.fields
					.filter((field) => field.name.startsWith("customFields."))
					.map((field) => [
						field.name.slice("customFields.".length),
						selected[field.name],
					]),
			);
			const tags = [
				...new Set([
					...(preview.survivor as Contact).tags,
					...(preview.source as Contact).tags,
				]),
			];
			const parsed = createContactSchema.parse({
				...Object.fromEntries(
					Object.entries(selected).filter(
						([name]) => !name.startsWith("customFields."),
					),
				),
				customFields,
				tags,
			});
			data = {
				...parsed,
				tags: JSON.stringify(parsed.tags),
				customFields: JSON.stringify(parsed.customFields),
				normalizedEmail: normalizeCrmEmail(parsed.email),
			};
		} else {
			const parsed = createCompanySchema.parse(selected);
			data = { ...parsed, normalizedDomain: normalizeCrmDomain(parsed.domain) };
		}
		for (const { model, field } of getCrmMergeRelations(entity, declared)) {
			await tx.updateMany({
				model,
				where: [{ field, value: input.sourceId, operator: "eq" }],
				update: {
					[field]: input.survivorId,
					...(model === "crmDeal" ? { updatedAt: new Date() } : {}),
					...(model === "crmContact"
						? { revision: crypto.randomUUID(), updatedAt: new Date() }
						: {}),
				},
			});
		}
		await tx.updateMany({
			model: "crmMerge",
			where: [
				{ field: "entity", value: entity, operator: "eq" },
				{ field: "survivorId", value: input.sourceId, operator: "eq" },
			],
			update: { survivorId: input.survivorId },
		});
		await tx.create({
			model: "crmMerge",
			data: {
				sourceKey: `${entity}:${input.sourceId}`,
				entity,
				sourceId: input.sourceId,
				survivorId: input.survivorId,
				sourceEmail:
					entity === "contact"
						? normalizeCrmEmail((preview.source as Contact).email)
						: null,
				survivorEmail:
					entity === "contact"
						? normalizeCrmEmail((preview.survivor as Contact).email)
						: null,
				sourceSnapshot: JSON.stringify(preview.source),
				survivorSnapshot: JSON.stringify(preview.survivor),
				choices: JSON.stringify(input.choices),
				createdAt: new Date(),
			},
		});
		await tx.update({
			model: crmMergeModel(entity),
			where: [{ field: "id", value: input.survivorId, operator: "eq" }],
			update: { ...data, updatedAt: new Date() },
		});
		await tx.delete({
			model: crmMergeModel(entity),
			where: [{ field: "id", value: input.sourceId, operator: "eq" }],
		});
		return serializeMergeRecord(
			entity,
			await requireMergeRecord(tx, entity, input.survivorId),
		);
	});
}
