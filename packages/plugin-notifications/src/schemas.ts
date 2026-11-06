import { z } from "zod";

const recipientId = z.string().trim().min(1).max(256);
const category = z.string().trim().min(1).max(100);
export const recipientSchema = z.object({
	recipientId: recipientId.optional(),
});
export const notificationIdSchema = z.object({
	id: z.string().min(1).max(256),
});
export const listNotificationsSchema = recipientSchema.extend({
	status: z.enum(["all", "unread"]).default("all"),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
export const notificationPreferenceSchema = z.object({
	category,
	inApp: z.boolean(),
	email: z.boolean(),
});
export const updatePreferencesSchema = recipientSchema.extend({
	preferences: z
		.array(notificationPreferenceSchema)
		.max(100)
		.refine(
			(values) =>
				new Set(values.map((value) => value.category)).size === values.length,
			"Each category must appear once",
		),
});
export const sendNotificationSchema = z.object({
	recipientId,
	category,
	title: z.string().trim().min(1).max(200),
	body: z.string().max(10000),
	href: z
		.string()
		.max(2048)
		.refine(
			(href) =>
				(href.startsWith("/") &&
					!href.startsWith("//") &&
					!href.includes("\\")) ||
				/^https?:\/\//i.test(href),
			"Use a relative path or HTTP(S) URL",
		)
		.optional(),
});
export type SendNotificationInput = z.input<typeof sendNotificationSchema>;
export type UpdatePreferencesInput = z.input<typeof updatePreferencesSchema>;
export type ListNotificationsInput = z.input<typeof listNotificationsSchema>;
