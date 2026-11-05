import { z } from "zod";

const header = z
	.string()
	.trim()
	.min(1)
	.max(500)
	.refine(
		(value) => !/[\r\n]/.test(value),
		"Email headers must not contain line breaks",
	);
export const subscriberStatusSchema = z.enum([
	"subscribed",
	"unsubscribed",
	"bounced",
]);
export const tagsSchema = z
	.array(z.string().trim().min(1).max(100))
	.max(50)
	.default([]);
export const emailSchema = z
	.email()
	.max(320)
	.transform((email) => email.trim().toLowerCase());
export const subscribeSchema = z.object({
	email: emailSchema,
	name: z.string().trim().max(200).optional(),
	tags: tagsSchema,
});
export const createSubscriberSchema = subscribeSchema.extend({
	status: subscriberStatusSchema.default("subscribed"),
});
export const updateSubscriberSchema = createSubscriberSchema.partial().extend({
	tags: tagsSchema.removeDefault().optional(),
	status: subscriberStatusSchema.optional(),
});
export const listSubscribersSchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0),
	query: z.string().max(200).optional(),
	status: subscriberStatusSchema.optional(),
	tag: z.string().max(100).optional(),
});
export const listCampaignsSchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(50),
	offset: z.coerce.number().int().min(0).default(0),
});
export const createCampaignSchema = z.object({
	subject: header,
	fromName: header.max(200),
	fromEmail: emailSchema,
	replyTo: emailSchema.optional(),
	body: z.string().min(1).max(1_000_000),
	format: z.enum(["markdown", "html"]).default("markdown"),
	tags: tagsSchema,
});
export const updateCampaignSchema = createCampaignSchema.partial().extend({
	replyTo: emailSchema.nullable().optional(),
	tags: tagsSchema.removeDefault().optional(),
	format: z.enum(["markdown", "html"]).optional(),
});
export const idSchema = z.object({ id: z.string().min(1).max(200) });
export const tokenSchema = z.object({
	token: z.string().regex(/^[a-f0-9]{64}$/),
});
export const scheduleCampaignSchema = z.object({
	scheduledAt: z.iso.datetime({ offset: true }),
});
export const testCampaignSchema = z.object({ email: emailSchema });
export const importSubscribersSchema = z.object({
	csv: z.string().min(1).max(2_000_000),
});
export const transactionalEmailSchema = z.object({
	to: emailSchema,
	subject: header,
	html: z.string().min(1).max(1_000_000),
	from: header,
	replyTo: emailSchema.optional(),
});
