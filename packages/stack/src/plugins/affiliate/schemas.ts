import { z } from "zod";

export const affiliateCodeSchema = z
	.string()
	.trim()
	.min(3)
	.max(64)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const moneySchema = z
	.number()
	.int()
	.nonnegative()
	.max(Number.MAX_SAFE_INTEGER);
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const affiliateStatusSchema = z.enum([
	"pending",
	"approved",
	"suspended",
]);
export const commissionTypeSchema = z.enum(["percent", "flat"]);
export const commissionStatusSchema = z.enum([
	"pending",
	"approved",
	"paid",
	"voided",
]);
export const payoutStatusSchema = z.enum(["pending", "sent", "failed"]);
export const idSchema = z.object({ id: z.string().min(1) });
export const listSchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).optional(),
	offset: z.coerce.number().int().nonnegative().optional(),
	affiliateId: z.string().min(1).optional(),
	status: z.string().optional(),
	currency: currencySchema.optional(),
});
export const applicationSchema = z.object({
	name: z.string().trim().min(1).max(200),
	email: z.email().max(320),
	code: affiliateCodeSchema.optional(),
	payoutDetails: z.string().max(10000).optional(),
});
export const createAffiliateSchema = applicationSchema.extend({
	userId: z.string().min(1),
});
export const updateAffiliateSchema = applicationSchema.partial().extend({
	payoutDetails: z.string().max(10000).nullable().optional(),
	status: affiliateStatusSchema.optional(),
	notes: z.string().max(10000).nullable().optional(),
	commissionType: commissionTypeSchema.nullable().optional(),
	commissionValue: z.number().finite().nonnegative().nullable().optional(),
});
export const updatePortalSchema = applicationSchema
	.partial()
	.extend({ payoutDetails: z.string().max(10000).nullable().optional() });
export const trackClickSchema = z.object({
	code: affiliateCodeSchema,
	landingPath: z.string().max(2048).optional(),
	referrer: z.string().max(2048).optional(),
});
export const createConversionSchema = z.object({
	externalRef: z.string().min(1).max(255).optional(),
	amount: moneySchema,
	currency: currencySchema.default("USD"),
	attribution: z
		.object({
			code: affiliateCodeSchema.optional(),
			clickId: z.string().min(1).optional(),
		})
		.refine(
			(v) => v.code || v.clickId,
			"Attribution requires a code or click ID",
		)
		.optional(),
});
export const updateCommissionSchema = z.object({
	status: z.enum(["approved", "voided"]),
});
export const createPayoutSchema = z.object({
	affiliateId: z.string().min(1),
	currency: currencySchema,
	commissionIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
});
export const updatePayoutSchema = z.object({
	status: z.enum(["sent", "failed"]),
	reference: z.string().max(1000).optional(),
});
