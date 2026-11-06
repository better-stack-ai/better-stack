import { z } from "zod";

export const timezoneSchema = z
	.string()
	.min(1)
	.max(100)
	.refine((zone) => {
		try {
			new Intl.DateTimeFormat("en", { timeZone: zone }).format();
			return true;
		} catch {
			return false;
		}
	}, "Invalid timezone");

export const calendarDateSchema = z.iso.date();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const endTimeSchema = z.union([timeSchema, z.literal("24:00")]);
const intervalSchema = z
	.object({ start: timeSchema, end: endTimeSchema })
	.refine(
		({ start, end }) => start < end,
		"Availability must end after it starts",
	);
export const weeklyAvailabilitySchema = z
	.object({
		dayOfWeek: z.number().int().min(0).max(6),
		start: timeSchema,
		end: endTimeSchema,
	})
	.refine(
		({ start, end }) => start < end,
		"Availability must end after it starts",
	);
export const dateOverrideSchema = z.object({
	date: calendarDateSchema,
	intervals: z.array(intervalSchema).max(24),
});
const limitSchema = z.number().int().positive().max(1_000_000).optional();
export const bookingLimitsSchema = z.object({
	perHour: limitSchema,
	perDay: limitSchema,
	perWeek: limitSchema,
	total: limitSchema,
});

export const createEventTypeSchema = z
	.object({
		slug: z
			.string()
			.min(1)
			.max(100)
			.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
		name: z.string().trim().min(1).max(200),
		description: z.string().max(5000).default(""),
		location: z.string().max(500).default(""),
		duration: z.number().int().min(1).max(1440),
		capacity: z.number().int().min(1).max(10000).default(1),
		price: z
			.number()
			.int()
			.nonnegative()
			.max(Number.MAX_SAFE_INTEGER)
			.nullish(),
		currency: z
			.string()
			.regex(/^[A-Z]{3}$/)
			.nullish(),
		timezone: timezoneSchema,
		weeklyAvailability: z.array(weeklyAvailabilitySchema).max(168).default([]),
		dateOverrides: z
			.array(dateOverrideSchema)
			.max(366)
			.default([])
			.refine(
				(overrides) =>
					new Set(overrides.map((override) => override.date)).size ===
					overrides.length,
				"Only one override is allowed per date",
			),
		limits: bookingLimitsSchema.default({}),
		active: z.boolean().default(true),
	})
	.refine(({ price, currency }) => (price != null) === (currency != null), {
		message: "Supply price and currency together",
		path: ["currency"],
	});

export const createBookingSchema = z.object({
	start: z.iso.datetime({ offset: true }),
	timezone: timezoneSchema,
	name: z.string().trim().min(1).max(200),
	email: z
		.email()
		.max(320)
		.transform((value) => value.toLowerCase()),
});
export const availabilityQuerySchema = z.object({
	date: calendarDateSchema,
	timezone: timezoneSchema,
});
export const rescheduleBookingSchema = z.object({
	start: z.iso.datetime({ offset: true }),
	timezone: timezoneSchema,
});
export const listBookingsQuerySchema = z.object({
	period: z.enum(["upcoming", "past", "all"]).default("upcoming"),
	eventTypeId: z.string().min(1).optional(),
});
