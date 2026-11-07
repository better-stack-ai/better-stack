import type { DeepReadonly } from "@btst/stack/plugins/api";
import type { Availability, Booking, BusyInterval, EventType } from "./types";

function dateFormatter(timezone: string) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	});
}

function localParts(formatter: Intl.DateTimeFormat, date: Date) {
	const parts = formatter.formatToParts(date);
	const value = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)!.value;
	const day = `${value("year")}-${value("month")}-${value("day")}`;
	return {
		date: day,
		minute: Number(value("hour")) * 60 + Number(value("minute")),
	};
}

function minutes(time: string) {
	return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

function weekStart(date: string) {
	const day = new Date(`${date}T00:00:00Z`);
	day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
	return day.toISOString().slice(0, 10);
}

/** Calculate slots in the viewer's local date, preserving real DST instants. */
export function calculateAvailability(
	event: DeepReadonly<EventType>,
	bookings: readonly DeepReadonly<Booking>[],
	date: string,
	timezone: string,
	now = new Date(),
	busyIntervals: readonly BusyInterval[] = [],
): Availability {
	const slots: Availability["slots"] = [];
	const waitlistSlots: Availability["slots"] = [];
	if (!event.active) return { date, timezone, slots };
	const viewer = dateFormatter(timezone);
	const host = dateFormatter(event.timezone);
	const dayCenter = Date.parse(`${date}T00:00:00Z`);
	const duration = event.duration * 60_000;
	const earliestStart = dayCenter - 24 * 60 * 60_000;
	const latestStart = dayCenter + 48 * 60 * 60_000;
	const hourCounts =
		event.limits.perHour === undefined ? undefined : new Map<string, number>();
	const dayCounts =
		event.limits.perDay === undefined ? undefined : new Map<string, number>();
	const weekCounts =
		event.limits.perWeek === undefined ? undefined : new Map<string, number>();
	let totalCount = 0;
	const possibleOverlaps: {
		eventTypeId: string;
		start: number;
		end: number;
	}[] = [];
	for (const booking of bookings) {
		if (booking.status === "cancelled") continue;
		const start = Date.parse(booking.start);
		const end = Date.parse(booking.end);
		if (start < latestStart + duration && end > earliestStart)
			possibleOverlaps.push({ eventTypeId: booking.eventTypeId, start, end });
		if (booking.eventTypeId !== event.id) continue;
		if (event.limits.total !== undefined) totalCount++;
		if (!hourCounts && !dayCounts && !weekCounts) continue;
		const local = localParts(host, new Date(start));
		if (hourCounts) {
			const hour = `${local.date}:${Math.floor(local.minute / 60)}`;
			hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
		}
		if (dayCounts)
			dayCounts.set(local.date, (dayCounts.get(local.date) ?? 0) + 1);
		if (weekCounts) {
			const week = weekStart(local.date);
			weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
		}
	}
	const hostTimes = new Map<number, ReturnType<typeof localParts>>();
	const hostTime = (instant: number) => {
		let value = hostTimes.get(instant);
		if (!value) {
			value = localParts(host, new Date(instant));
			hostTimes.set(instant, value);
		}
		return value;
	};
	// IANA offsets fit within 24 hours; this also includes both fall-back instants.
	for (let start = earliestStart; start < latestStart; start += 60_000) {
		if (start <= now.getTime()) continue;
		const instant = new Date(start);
		if (localParts(viewer, instant).date !== date) continue;
		const local = hostTime(start);
		const weekday = new Date(`${local.date}T00:00:00Z`).getUTCDay();
		const override = event.dateOverrides.find(
			(item) => item.date === local.date,
		);
		const intervals =
			override?.intervals ??
			event.weeklyAvailability.filter((item) => item.dayOfWeek === weekday);
		const end = start + duration;
		const fits = intervals.some((interval) => {
			const first = minutes(interval.start);
			const last = minutes(interval.end);
			if (local.minute < first || (local.minute - first) % event.duration !== 0)
				return false;
			// Every real minute must remain inside the wall-clock interval, including DST folds.
			for (let minute = start; minute < end; minute += 60_000) {
				const part = hostTime(minute);
				if (
					part.date !== local.date ||
					part.minute < first ||
					part.minute >= last
				)
					return false;
			}
			return true;
		});
		if (!fits) continue;
		if (
			busyIntervals.some(
				(busy) => busy.start.getTime() < end && busy.end.getTime() > start,
			)
		)
			continue;
		let attendeeCount = 0;
		let blocked = false;
		for (const booking of possibleOverlaps) {
			if (booking.start >= end || booking.end <= start) continue;
			if (
				booking.eventTypeId !== event.id ||
				booking.start !== start ||
				booking.end !== end
			) {
				blocked = true;
				break;
			}
			attendeeCount++;
		}
		if (blocked) continue;
		let remaining = event.capacity;
		if (hourCounts)
			remaining = Math.min(
				remaining,
				event.limits.perHour! -
					(hourCounts.get(`${local.date}:${Math.floor(local.minute / 60)}`) ??
						0),
			);
		if (dayCounts)
			remaining = Math.min(
				remaining,
				event.limits.perDay! - (dayCounts.get(local.date) ?? 0),
			);
		if (weekCounts)
			remaining = Math.min(
				remaining,
				event.limits.perWeek! - (weekCounts.get(weekStart(local.date)) ?? 0),
			);
		if (event.limits.total !== undefined)
			remaining = Math.min(remaining, event.limits.total - totalCount);
		if (
			remaining >= 0 &&
			attendeeCount >= event.capacity &&
			event.waitlistEnabled &&
			event.capacity > 1 &&
			!event.teamAvailabilityIds?.length
		)
			waitlistSlots.push({
				start: instant.toISOString(),
				end: new Date(end).toISOString(),
				remaining: 0,
			});
		remaining = Math.min(remaining, event.capacity - attendeeCount);
		if (remaining > 0)
			slots.push({
				start: instant.toISOString(),
				end: new Date(end).toISOString(),
				remaining,
			});
	}
	return {
		date,
		timezone,
		slots,
		...(event.waitlistEnabled &&
		event.capacity > 1 &&
		!event.teamAvailabilityIds?.length
			? { waitlistSlots }
			: {}),
	};
}

export function dateInTimezone(instant: string, timezone: string) {
	return localParts(dateFormatter(timezone), new Date(instant)).date;
}
