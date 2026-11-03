import type { DeepReadonly } from "@btst/stack/plugins/api";
import type { Availability, Booking, EventType } from "./types";

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
): Availability {
	const slots: Availability["slots"] = [];
	if (!event.active) return { date, timezone, slots };
	const viewer = dateFormatter(timezone);
	const host = dateFormatter(event.timezone);
	const confirmed = bookings.filter(
		(booking) => booking.status === "confirmed",
	);
	const own = confirmed.filter((booking) => booking.eventTypeId === event.id);
	const ownLocal = own.map((booking) => ({
		booking,
		...localParts(host, new Date(booking.start)),
	}));
	const dayCenter = Date.parse(`${date}T00:00:00Z`);
	const duration = event.duration * 60_000;
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
	for (
		let start = dayCenter - 24 * 60 * 60_000;
		start < dayCenter + 48 * 60 * 60_000;
		start += 60_000
	) {
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
		const overlapping = confirmed.filter(
			(booking) =>
				Date.parse(booking.start) < end && Date.parse(booking.end) > start,
		);
		if (
			overlapping.some(
				(booking) =>
					booking.eventTypeId !== event.id ||
					Date.parse(booking.start) !== start ||
					Date.parse(booking.end) !== end,
			)
		)
			continue;
		let remaining = event.capacity - overlapping.length;
		const hourCount = ownLocal.filter(
			(item) =>
				item.date === local.date &&
				Math.floor(item.minute / 60) === Math.floor(local.minute / 60),
		).length;
		const dayCount = ownLocal.filter((item) => item.date === local.date).length;
		const weekCount = ownLocal.filter(
			(item) => weekStart(item.date) === weekStart(local.date),
		).length;
		for (const [limit, count] of [
			[event.limits.perHour, hourCount],
			[event.limits.perDay, dayCount],
			[event.limits.perWeek, weekCount],
			[event.limits.total, own.length],
		] as const) {
			if (limit !== undefined) remaining = Math.min(remaining, limit - count);
		}
		if (remaining > 0)
			slots.push({
				start: instant.toISOString(),
				end: new Date(end).toISOString(),
				remaining,
			});
	}
	return { date, timezone, slots };
}

export function dateInTimezone(instant: string, timezone: string) {
	return localParts(dateFormatter(timezone), new Date(instant)).date;
}
