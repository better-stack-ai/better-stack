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
/** A trusted application staff-directory entry eligible for deal assignment. */
export type CrmOwner = { id: string; name: string };
/** Directory choices and the authenticated current user, never supplied by a browser. */
export type CrmOwnerDirectory = {
	items: CrmOwner[];
	currentUserId: string | null;
};
/** Trusted membership lookup; exclude staff who can no longer receive deals. */
export type CrmStaffDirectory = (
	context: CrmHookContext,
) => Promise<CrmOwner[]> | CrmOwner[];
/** A deal's title and stage are projected from its Kanban task, avoiding duplicate state. */
export type Deal = {
	id: string;
	taskId: string;
	/** Canonical Kanban task assignee, or null for pre-existing unassigned deals. */
	ownerId: string | null;
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
	customFields: string;
	createdAt: Date;
	updatedAt: Date;
}
/** Internal company storage. */
export interface CompanyRecord
	extends Omit<Company, "createdAt" | "updatedAt"> {
	createdAt: Date;
	updatedAt: Date;
}
/** Internal metadata for a Kanban-backed deal. */
export interface DealRecord
	extends Omit<
		Deal,
		| "ownerId"
		| "title"
		| "stage"
		| "pipelineId"
		| "createdAt"
		| "updatedAt"
		| "closeDate"
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
