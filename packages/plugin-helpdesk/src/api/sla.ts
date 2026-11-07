import { z } from "zod";
import type { HelpdeskBusinessCalendar, HelpdeskSlaTargets } from "../types";

const minute = 60_000;
const day = 86_400_000;
const targetSchema = z.number().positive().finite().max(5_256_000);
const targetsSchema = z.object({
	low: targetSchema,
	medium: targetSchema,
	high: targetSchema,
	urgent: targetSchema,
});
const clockMinutes = (value: string) => {
	const [hours, minutes] = value.split(":").map(Number);
	return hours! * 60 + minutes!;
};
const calendarSchema = z
	.object({
		timeZone: z
			.string()
			.min(1)
			.refine((value) => {
				try {
					new Intl.DateTimeFormat("en", { timeZone: value });
					return true;
				} catch {
					return false;
				}
			}, "Invalid business-calendar timezone"),
		workingIntervals: z
			.array(
				z
					.object({
						dayOfWeek: z.union([
							z.literal(0),
							z.literal(1),
							z.literal(2),
							z.literal(3),
							z.literal(4),
							z.literal(5),
							z.literal(6),
						]),
						start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
						end: z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/),
					})
					.strict(),
			)
			.min(1)
			.max(10_080),
		holidays: z
			.array(
				z
					.string()
					.regex(/^\d{4}-\d{2}-\d{2}$/)
					.refine((value) => {
						const parsed = new Date(`${value}T00:00:00Z`);
						return (
							Number.isFinite(parsed.getTime()) &&
							parsed.toISOString().slice(0, 10) === value
						);
					}, "Invalid holiday date"),
			)
			.max(36_600)
			.optional(),
	})
	.strict()
	.superRefine((calendar, context) => {
		const intervals = [...calendar.workingIntervals].sort(
			(a, b) => a.dayOfWeek - b.dayOfWeek || a.start.localeCompare(b.start),
		);
		for (let index = 0; index < intervals.length; index++) {
			const interval = intervals[index]!;
			const previous = intervals[index - 1];
			if (
				clockMinutes(interval.start) >= clockMinutes(interval.end) ||
				(previous?.dayOfWeek === interval.dayOfWeek &&
					clockMinutes(previous.end) > clockMinutes(interval.start))
			) {
				context.addIssue({
					code: "custom",
					message:
						"Working intervals must have increasing times and cannot overlap",
				});
			}
		}
		if (new Set(calendar.holidays).size !== (calendar.holidays?.length ?? 0)) {
			context.addIssue({
				code: "custom",
				message: "Holiday dates must be unique",
			});
		}
	});

const policySchema = z.object({
	version: z.literal(1),
	responseTargets: targetsSchema,
	resolutionTargets: targetsSchema.partial().optional(),
	businessCalendar: calendarSchema.optional(),
});
type SlaPolicy = z.output<typeof policySchema>;

/** Parse into a detached snapshot so later mutation of application options has no effect. */
export function createSlaPolicy(options: {
	slaTargets?: Partial<HelpdeskSlaTargets>;
	resolutionTargets?: Partial<HelpdeskSlaTargets>;
	businessCalendar?: HelpdeskBusinessCalendar;
}): SlaPolicy {
	return policySchema.parse({
		version: 1,
		responseTargets: {
			low: 2880,
			medium: 1440,
			high: 240,
			urgent: 60,
			...options.slaTargets,
		},
		resolutionTargets: options.resolutionTargets,
		businessCalendar: options.businessCalendar,
	});
}

/** Validate stored snapshots rather than silently applying a different current policy. */
export function readSlaPolicy(value: string): SlaPolicy {
	return policySchema.parse(JSON.parse(value));
}

/** Add actual elapsed working minutes; repeated DST minutes count twice, missing ones zero. */
export function calculateSlaDeadline(
	createdAt: Date,
	minutes: number,
	calendar?: HelpdeskBusinessCalendar,
): Date {
	if (!calendar) return new Date(createdAt.getTime() + minutes * minute);
	const offsetFormatter = new Intl.DateTimeFormat("en", {
		timeZone: calendar.timeZone,
		hour: "2-digit",
		hourCycle: "h23",
		timeZoneName: "longOffset",
	});
	const offsetAt = (timestamp: number) => {
		const name = offsetFormatter
			.formatToParts(timestamp)
			.find((part) => part.type === "timeZoneName")!.value;
		if (name === "GMT") return 0;
		const [hours, minutes, seconds = 0] = name.slice(4).split(":").map(Number);
		return (
			(name[3] === "+" ? 1 : -1) *
			(hours! * 60 * minute + minutes! * minute + seconds * 1000)
		);
	};
	const local = new Date(createdAt.getTime() + offsetAt(createdAt.getTime()));
	local.setUTCHours(0, 0, 0, 0);
	const horizon = new Date(createdAt);
	horizon.setUTCFullYear(horizon.getUTCFullYear() + 100);
	const exhausted = () =>
		new RangeError("Helpdesk business-calendar SLA deadline exceeds 100 years");
	if (!Number.isFinite(horizon.getTime())) throw exhausted();
	const holidays = new Set(calendar.holidays);
	let remaining = minutes * minute;
	for (let date = local.getTime(); date < horizon.getTime(); date += day) {
		const localDate = new Date(date);
		const intervals = calendar.workingIntervals.filter(
			(interval) => interval.dayOfWeek === localDate.getUTCDay(),
		);
		if (!intervals.length || holidays.has(localDate.toISOString().slice(0, 10)))
			continue;
		// Split the UTC window at offset transitions before intersecting local working intervals.
		const segments: Array<{ start: number; end: number; offset: number }> = [];
		let segmentStart = date - day;
		let previousSample = segmentStart;
		let offset = offsetAt(segmentStart);
		for (
			let sample = segmentStart + day / 4;
			sample <= date + 2 * day;
			sample += day / 4
		) {
			const nextOffset = offsetAt(sample);
			if (nextOffset !== offset) {
				let low = previousSample;
				let high = sample;
				while (high - low > 1000) {
					const middle = Math.floor((low + high) / 2000) * 1000;
					if (offsetAt(middle) === offset) low = middle;
					else high = middle;
				}
				segments.push({ start: segmentStart, end: high, offset });
				segmentStart = high;
				offset = nextOffset;
			}
			previousSample = sample;
		}
		segments.push({ start: segmentStart, end: date + 2 * day, offset });
		const working: Array<{ start: number; end: number }> = [];
		for (const interval of intervals) {
			for (const segment of segments) {
				const start = Math.max(
					createdAt.getTime(),
					segment.start,
					date + clockMinutes(interval.start) * minute - segment.offset,
				);
				const end = Math.min(
					segment.end,
					date + clockMinutes(interval.end) * minute - segment.offset,
					horizon.getTime(),
				);
				if (end > start) working.push({ start, end });
			}
		}
		working.sort((a, b) => a.start - b.start);
		for (const interval of working) {
			if (remaining <= interval.end - interval.start)
				return new Date(interval.start + remaining);
			remaining -= interval.end - interval.start;
		}
	}
	throw exhausted();
}
