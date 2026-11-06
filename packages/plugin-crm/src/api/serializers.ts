import type {
	ContactRecord,
	CompanyRecord,
	ActivityRecord,
	Contact,
	Company,
	Activity,
} from "../types";
const iso = (date: Date | string) => new Date(date).toISOString();
/** Serialize JSON fields and dates at the API boundary. */
export function serializeContact(row: ContactRecord): Contact {
	return {
		...row,
		tags: JSON.parse(row.tags || "[]"),
		customFields: JSON.parse(row.customFields || "{}"),
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
	};
}
/** Serialize company dates. */
export function serializeCompany(row: CompanyRecord): Company {
	return {
		...row,
		createdAt: iso(row.createdAt),
		updatedAt: iso(row.updatedAt),
	};
}
/** Serialize follow-up dates. */
export function serializeActivity(row: ActivityRecord): Activity {
	return {
		...row,
		dueAt: row.dueAt ? iso(row.dueAt) : null,
		completedAt: row.completedAt ? iso(row.completedAt) : null,
		remindedAt: row.remindedAt ? iso(row.remindedAt) : null,
		createdAt: iso(row.createdAt),
	};
}
