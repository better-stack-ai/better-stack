import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type { StackIdentity } from "@btst/stack/context";
import type { Contact, Company, Deal, Activity, Pipeline } from "./types";

/** Identity scope for protected CRM queries. */
export type CrmIdentityPartition =
	| StackIdentity
	| `pending:${number}`
	| `error:${number}`;
/** Search and pagination for CRM collections. */
export interface CrmListParams {
	search?: string;
	tag?: string;
	companyId?: string;
	contactId?: string;
	dealId?: string;
	pipelineId?: string;
	status?: string;
	limit?: number;
	offset?: number;
}
/** Contact fields accepted by the CRM editor. */
export interface ContactInput {
	firstName: string;
	lastName?: string;
	email?: string | null;
	phone?: string;
	company?: string;
	companyId?: string | null;
	title?: string;
	tags?: string[];
	customFields?: Record<string, string>;
	notes?: string;
}
/** Company details. */
export interface CompanyInput {
	name: string;
	domain?: string;
	phone?: string;
	notes?: string;
}
/** Deal details and its Kanban stage. */
export interface DealInput {
	title: string;
	value?: number | null;
	currency?: string;
	pipelineId: string;
	stage: string;
	contactId?: string | null;
	companyId?: string | null;
	closeDate?: string | null;
	status?: "open" | "won" | "lost";
}
/** Editable deal metadata; use the move mutation to change its Kanban stage. */
export type DealUpdateInput = Partial<Omit<DealInput, "pipelineId" | "stage">>;
/** A logged interaction or follow-up. */
export interface ActivityInput {
	type: "note" | "call" | "email" | "meeting";
	body: string;
	contactId?: string;
	dealId?: string;
	dueAt?: string | null;
}
/** Editable activity details and follow-up completion. */
export type ActivityUpdateInput = Partial<
	Pick<ActivityInput, "body" | "dueAt">
> & {
	completedAt?: string | null;
};
/** A pipeline backed by a Kanban board. */
export interface PipelineInput {
	name: string;
	slug?: string;
	stages?: string[];
}

export const crmResources = {
	crmContacts: {
		queries: {
			list: {
				path: "/crm/contacts",
				query: (
					params: CrmListParams = {},
					_identity?: CrmIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): { items: Contact[]; total: number } =>
					data as { items: Contact[]; total: number },
			},
			detail: {
				path: "/crm/contacts/:id",
				params: (id: string, _identity?: CrmIdentityPartition) => ({ id }),
				select: (data: unknown): Contact => data as Contact,
			},
		},
		mutations: {
			create: {
				path: "@post/crm/contacts",
				method: "POST",
				input: (body: ContactInput) => ({ body }),
				select: (data: unknown): Contact => data as Contact,
				invalidates: ["crmContacts", "crmPipelines"],
				refresh: false,
			},
			update: {
				path: "@put/crm/contacts/:id",
				method: "PUT",
				input: ({ id, data }: { id: string; data: Partial<ContactInput> }) => ({
					params: { id },
					body: data,
				}),
				select: (data: unknown): Contact => data as Contact,
				invalidates: ["crmContacts", "crmPipelines"],
				refresh: false,
			},
			delete: {
				path: "@delete/crm/contacts/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: ["crmContacts", "crmPipelines"],
				refresh: false,
			},
		},
	},
	crmCompanies: {
		queries: {
			list: {
				path: "/crm/companies",
				query: (
					params: CrmListParams = {},
					_identity?: CrmIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): { items: Company[]; total: number } =>
					data as { items: Company[]; total: number },
			},
			detail: {
				path: "/crm/companies/:id",
				params: (id: string, _identity?: CrmIdentityPartition) => ({ id }),
				select: (data: unknown): Company => data as Company,
			},
		},
		mutations: {
			create: {
				path: "@post/crm/companies",
				method: "POST",
				input: (body: CompanyInput) => ({ body }),
				select: (data: unknown): Company => data as Company,
				invalidates: ["crmCompanies", "crmPipelines"],
				refresh: false,
			},
			update: {
				path: "@put/crm/companies/:id",
				method: "PUT",
				input: ({ id, data }: { id: string; data: Partial<CompanyInput> }) => ({
					params: { id },
					body: data,
				}),
				select: (data: unknown): Company => data as Company,
				invalidates: ["crmCompanies", "crmPipelines"],
				refresh: false,
			},
			delete: {
				path: "@delete/crm/companies/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: ["crmCompanies", "crmPipelines"],
				refresh: false,
			},
		},
	},
	crmDeals: {
		queries: {
			list: {
				path: "/crm/deals",
				query: (
					params: CrmListParams = {},
					_identity?: CrmIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): { items: Deal[]; total: number } =>
					data as { items: Deal[]; total: number },
			},
			detail: {
				path: "/crm/deals/:id",
				params: (id: string, _identity?: CrmIdentityPartition) => ({ id }),
				select: (data: unknown): Deal => data as Deal,
			},
		},
		mutations: {
			create: {
				path: "@post/crm/deals",
				method: "POST",
				input: (body: DealInput) => ({ body }),
				select: (data: unknown): Deal => data as Deal,
				invalidates: ["crmDeals", "crmPipelines"],
				refresh: false,
			},
			update: {
				path: "@put/crm/deals/:id",
				method: "PUT",
				input: ({ id, data }: { id: string; data: DealUpdateInput }) => ({
					params: { id },
					body: data,
				}),
				select: (data: unknown): Deal => data as Deal,
				invalidates: ["crmDeals", "crmPipelines"],
				refresh: false,
			},
			delete: {
				path: "@delete/crm/deals/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: ["crmDeals", "crmPipelines"],
				refresh: false,
			},
			move: {
				path: "@post/crm/deals/:id/move",
				method: "POST",
				input: ({
					id,
					stage,
					order,
				}: {
					id: string;
					stage: string;
					order?: number;
				}) => ({ params: { id }, body: { stage, order } }),
				invalidates: ["crmDeals", "crmPipelines"],
				refresh: false,
			},
		},
	},
	crmActivities: {
		queries: {
			list: {
				path: "/crm/activities",
				query: (
					params: CrmListParams = {},
					_identity?: CrmIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): { items: Activity[]; total: number } =>
					data as { items: Activity[]; total: number },
			},
		},
		mutations: {
			create: {
				path: "@post/crm/activities",
				method: "POST",
				input: (body: ActivityInput) => ({ body }),
				select: (data: unknown): Activity => data as Activity,
				invalidates: ["crmActivities", "crmPipelines"],
				refresh: false,
			},
			update: {
				path: "@put/crm/activities/:id",
				method: "PUT",
				input: ({ id, data }: { id: string; data: ActivityUpdateInput }) => ({
					params: { id },
					body: data,
				}),
				select: (data: unknown): Activity => data as Activity,
				invalidates: ["crmActivities", "crmPipelines"],
				refresh: false,
			},
			delete: {
				path: "@delete/crm/activities/:id",
				method: "DELETE",
				input: (id: string) => ({ params: { id } }),
				invalidates: ["crmActivities", "crmPipelines"],
				refresh: false,
			},
		},
	},
	crmPipelines: {
		queries: {
			list: {
				path: "/crm/pipelines",
				query: (
					params: CrmListParams = {},
					_identity?: CrmIdentityPartition,
				) => ({ ...params }),
				select: (data: unknown): { items: Pipeline[]; total: number } =>
					data as { items: Pipeline[]; total: number },
			},
			detail: {
				path: "/crm/pipelines/:id",
				params: (id: string, _identity?: CrmIdentityPartition) => ({ id }),
				select: (data: unknown): Pipeline => data as Pipeline,
			},
		},
		mutations: {
			create: {
				path: "@post/crm/pipelines",
				method: "POST",
				input: (body: PipelineInput) => ({ body }),
				select: (data: unknown): Pipeline => data as Pipeline,
				invalidates: ["crmPipelines", "crmPipelines"],
				refresh: false,
			},
		},
	},
} satisfies ResourcesDeclaration;
/** Build query keys shared by request loaders and client hooks. */
export function createCrmQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, crmResources, headers);
}
