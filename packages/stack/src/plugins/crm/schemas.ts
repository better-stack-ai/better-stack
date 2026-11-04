import { z } from "zod";
const text = z.string().trim().max(500);
const optionalText = text.nullable().optional();
const relation = z.string().min(1).max(200).nullable().optional();
const date = z.iso.datetime({ offset: true }).nullable().optional();
export const idSchema = z.object({ id: z.string().min(1).max(200) });
export const paginationSchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
export const createContactSchema = z.object({
	firstName: text.min(1),
	lastName: optionalText,
	email: z.email().max(320).nullable().optional(),
	phone: optionalText,
	company: optionalText,
	companyId: relation,
	title: optionalText,
	notes: z.string().max(20000).nullable().optional(),
	tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
	customFields: z
		.record(z.string().min(1).max(100), z.string().max(2000))
		.refine((v) => Object.keys(v).length <= 100, "At most 100 custom fields")
		.default({}),
});
export const updateContactSchema = createContactSchema.partial().extend({
	tags: createContactSchema.shape.tags.removeDefault().optional(),
	customFields: createContactSchema.shape.customFields
		.removeDefault()
		.optional(),
});
export const listContactsSchema = paginationSchema.extend({
	search: text.optional(),
	tag: text.optional(),
	companyId: z.string().optional(),
});
export const createCompanySchema = z.object({
	name: text.min(1),
	domain: optionalText,
	phone: optionalText,
	notes: z.string().max(20000).nullable().optional(),
});
export const updateCompanySchema = createCompanySchema.partial();
export const listCompaniesSchema = paginationSchema.extend({
	search: text.optional(),
});
export const createPipelineSchema = z.object({
	name: text.min(1),
	slug: z
		.string()
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
		.max(200)
		.optional(),
	stages: z
		.array(text.min(1))
		.min(1)
		.max(30)
		.default(["Lead", "Qualified", "Proposal", "Closed"]),
});
export const createDealSchema = z.object({
	title: text.min(1),
	value: z.number().finite().min(0).nullable().optional(),
	currency: z
		.string()
		.regex(/^[A-Z]{3}$/)
		.default("USD"),
	stage: z.string().min(1),
	pipelineId: z.string().min(1),
	contactId: relation,
	companyId: relation,
	closeDate: date,
	status: z.enum(["open", "won", "lost"]).default("open"),
});
export const updateDealSchema = createDealSchema
	.omit({ stage: true, pipelineId: true })
	.partial()
	.extend({
		currency: createDealSchema.shape.currency.removeDefault().optional(),
		status: createDealSchema.shape.status.removeDefault().optional(),
	});
export const moveDealSchema = z.object({
	stage: z.string().min(1),
	order: z.number().finite().min(0).optional(),
});
export const listDealsSchema = paginationSchema.extend({
	pipelineId: z.string().optional(),
	contactId: z.string().optional(),
	companyId: z.string().optional(),
	status: z.enum(["open", "won", "lost"]).optional(),
});
export const createActivitySchema = z
	.object({
		type: z.enum(["note", "call", "email", "meeting"]),
		body: z.string().trim().min(1).max(20000),
		contactId: relation,
		dealId: relation,
		dueAt: date,
	})
	.refine(
		(v) => !!(v.contactId || v.dealId),
		"An activity needs a contact or deal",
	);
export const updateActivitySchema = z.object({
	body: z.string().trim().min(1).max(20000).optional(),
	dueAt: date,
	completedAt: date,
});
export const listActivitiesSchema = paginationSchema.extend({
	contactId: z.string().optional(),
	dealId: z.string().optional(),
});
