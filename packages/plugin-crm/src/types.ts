import type { DeepReadonly } from "@btst/stack/plugins/api";
import type { z } from "zod";
import type {
	createContactSchema,
	createCompanySchema,
	createDealSchema,
} from "./schemas";

/** Contact with arbitrary string custom fields and normalized tags. */
export type Contact = {
	id: string;
	firstName: string;
	lastName?: string | null;
	email?: string | null;
	phone?: string | null;
	company?: string | null;
	companyId?: string | null;
	title?: string | null;
	notes?: string | null;
	tags: string[];
	customFields: Record<string, string>;
	createdAt: string;
	updatedAt: string;
};
/** A company shared by contacts and deals. */
export type Company = {
	id: string;
	name: string;
	domain?: string | null;
	phone?: string | null;
	notes?: string | null;
	createdAt: string;
	updatedAt: string;
};
/** A deal's title and stage are projected from its Kanban task, avoiding duplicate state. */
export type Deal = {
	id: string;
	taskId: string;
	title: string;
	value?: number | null;
	currency: string;
	stage: string;
	pipelineId: string;
	contactId?: string | null;
	companyId?: string | null;
	closeDate?: string | null;
	status: "open" | "won" | "lost";
	createdAt: string;
	updatedAt: string;
};
/** A logged interaction or scheduled follow-up. */
export type Activity = {
	id: string;
	type: "note" | "call" | "email" | "meeting";
	body: string;
	contactId?: string | null;
	dealId?: string | null;
	dueAt?: string | null;
	completedAt?: string | null;
	remindedAt?: string | null;
	createdAt: string;
};
/** A CRM pipeline is an ordinary Kanban board. */
export type Pipeline = {
	deals: Deal[];
	id: string;
	name: string;
	slug: string;
	description?: string;
	ownerId?: string;
	organizationId?: string;
	createdAt: string;
	updatedAt: string;
	columns: {
		id: string;
		title: string;
		order: number;
		boardId: string;
		createdAt: string;
		updatedAt: string;
		tasks: {
			id: string;
			title: string;
			description?: string;
			priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
			order: number;
			columnId: string;
			assigneeId?: string | null;
			completedAt?: string;
			isArchived: boolean;
			createdAt: string;
			updatedAt: string;
		}[];
	}[];
};
/** Hook context is supplied only after operation authorization. */
export interface CrmHookContext {
	readonly request?: Request;
}
type Hook<T> = (
	value: DeepReadonly<T>,
	context: CrmHookContext,
) => Promise<void> | void;
/** Lifecycle callbacks; reminder delivery is triggered by sendDueReminders in your scheduler. */
export interface CrmPluginHooks {
	onBeforeCreateContact?: Hook<z.output<typeof createContactSchema>>;
	onAfterCreateContact?: Hook<Contact>;
	onBeforeUpdateContact?: Hook<{
		id: string;
		data: Partial<z.output<typeof createContactSchema>>;
	}>;
	onAfterUpdateContact?: Hook<Contact>;
	onBeforeDeleteContact?: Hook<Contact>;
	onAfterDeleteContact?: Hook<{ id: string }>;
	onBeforeCreateCompany?: Hook<z.output<typeof createCompanySchema>>;
	onAfterCreateCompany?: Hook<Company>;
	onBeforeUpdateCompany?: Hook<{
		id: string;
		data: Partial<z.output<typeof createCompanySchema>>;
	}>;
	onAfterUpdateCompany?: Hook<Company>;
	onBeforeDeleteCompany?: Hook<Company>;
	onAfterDeleteCompany?: Hook<{ id: string }>;
	onBeforeCreateDeal?: Hook<z.output<typeof createDealSchema>>;
	onAfterCreateDeal?: Hook<Deal>;
	onBeforeUpdateDeal?: Hook<{
		id: string;
		data: Partial<z.output<typeof createDealSchema>>;
	}>;
	onAfterUpdateDeal?: Hook<Deal>;
	onBeforeDeleteDeal?: Hook<Deal>;
	onAfterDeleteDeal?: Hook<{ id: string }>;
	onBeforeLogActivity?: Hook<Omit<Activity, "id" | "createdAt">>;
	onAfterLogActivity?: Hook<Activity>;
	onAfterUpdateActivity?: Hook<Activity>;
	onAfterMoveDeal?: Hook<Deal>;
	/** Deliver the follow-up notification. Successful delivery is recorded to avoid repeat runs. */
	onActivityReminder?: Hook<Activity>;
}
/** Internal storage types; use operations rather than direct database access in requests. */
export interface ContactRecord
	extends Omit<Contact, "tags" | "customFields" | "createdAt" | "updatedAt"> {
	tags: string;
	revision: string;
	normalizedEmail?: string | null;
	customFields: string;
	createdAt: Date;
	updatedAt: Date;
}
/** Internal company storage. */
export interface CompanyRecord
	extends Omit<Company, "createdAt" | "updatedAt"> {
	createdAt: Date;
	revision: string;
	normalizedDomain?: string | null;
	updatedAt: Date;
}
/** Internal metadata for a Kanban-backed deal. */
export interface DealRecord
	extends Omit<
		Deal,
		"title" | "stage" | "pipelineId" | "createdAt" | "updatedAt" | "closeDate"
	> {
	closeDate?: Date | null;
	createdAt: Date;
	updatedAt: Date;
}
/** Internal activity storage. */
export interface ActivityRecord
	extends Omit<Activity, "dueAt" | "completedAt" | "remindedAt" | "createdAt"> {
	dueAt?: Date | null;
	completedAt?: Date | null;
	remindedAt?: Date | null;
	createdAt: Date;
}

/** CRM record categories supported by duplicate review and merging. */
export type MergeEntity = "contact" | "company";
/** Scalar foreign keys owned by the application and included in the CRM transaction. */
export interface CrmMergeRelation {
	entity: MergeEntity;
	model: string;
	field: string;
}
/** Paginated matches for manager review; shared normalized values do not establish identity. */
export type DuplicateSuggestions<T> = {
	items: T[];
	total: number;
	normalizedValue: string | null;
	identityVerified: false;
};
/** Selected records, opaque preview revisions, and explicit choices for conflicting fields. */
export interface MergeInput {
	survivorId: string;
	sourceId: string;
	versions: { survivor: string; source: string };
	choices: Record<string, "survivor" | "source">;
}
/** Read-only field plan, record revisions, relationship counts, and reconciliation warnings. */
export type MergePreview<T> = {
	survivor: T;
	source: T;
	versions: { survivor: string; source: string };
	fields: {
		name: string;
		survivorValue: string | string[] | null;
		sourceValue: string | string[] | null;
		conflict: boolean;
	}[];
	relationships: { name: string; count: number }[];
	warnings: string[];
};
/** Immutable source snapshots are retained even after a later survivor merge. */
export interface CrmMergeRecord {
	id: string;
	sourceKey: string;
	entity: MergeEntity;
	sourceId: string;
	survivorId: string;
	sourceEmail?: string | null;
	survivorEmail?: string | null;
	sourceSnapshot: string;
	survivorSnapshot: string;
	choices: string;
	createdAt: Date;
}
