"use client";

import { usePluginOverrides } from "@btst/stack/context";
import { CALENDAR_PLUGIN_ID } from "../constants";
import type { CalendarPluginOverrides } from "../overrides";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import type { useCalendarSlots } from "../hooks";
import { Field, calendarSelectClass } from "./shared";

export function calendarToday(timezone: string) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

export function CalendarTimePicker({
	page,
	...props
}: CalendarTimePickerProps & {
	page?: "calendarBooking" | "calendarReschedule";
}) {
	return page ? (
		<ScopedCalendarTimePicker page={page} {...props} />
	) : (
		<DefaultCalendarTimePicker {...props} />
	);
}

function ScopedCalendarTimePicker({
	page,
	...props
}: CalendarTimePickerProps & {
	page: "calendarBooking" | "calendarReschedule";
}) {
	const { pageOverrides } =
		usePluginOverrides<CalendarPluginOverrides>(CALENDAR_PLUGIN_ID);
	const Component =
		(page ? pageOverrides?.[page]?.TimePicker : undefined) ??
		DefaultCalendarTimePicker;
	return <Component {...props} />;
}

/** Values and change handlers supplied by a built-in booking page. */
export interface CalendarTimePickerProps {
	/** Selected date in YYYY-MM-DD format. */
	date: string;
	/** IANA timezone used for slot labels and queries. */
	timezone: string;
	/** Selected slot start, or an empty string. */
	start: string;
	/** Change the date; also clear the selected start. */
	onDate: (date: string) => void;
	/** Change the timezone; also clear the selected start. */
	onTimezone: (timezone: string) => void;
	/** Select a supplied slot start or clear the selection. */
	onStart: (start: string) => void;
	/** Page-owned availability result, including loading and error state. */
	slots: ReturnType<typeof useCalendarSlots>;
	/** Event capacity; defaults to one attendee. */
	capacity?: number;
}

function DefaultCalendarTimePicker({
	date,
	timezone,
	start,
	onDate,
	onTimezone,
	onStart,
	slots,
	capacity = 1,
}: CalendarTimePickerProps) {
	const zones = Array.from(
		new Set([timezone, "UTC", ...Intl.supportedValuesOf("timeZone")]),
	);
	return (
		<section
			aria-labelledby="calendar-choose-time"
			className="min-w-0 space-y-5"
		>
			<h2 id="calendar-choose-time" className="text-xl font-semibold">
				Choose a time
			</h2>
			<div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
				<Field id="calendar-date" label="Date">
					<Input
						id="calendar-date"
						className="min-h-11"
						type="date"
						required
						min={calendarToday(timezone)}
						value={date}
						onChange={(e) => {
							if (e.target.value) {
								onDate(e.target.value);
								onStart("");
							}
						}}
					/>
				</Field>
				<Field id="calendar-timezone" label="Timezone">
					<select
						id="calendar-timezone"
						className={calendarSelectClass}
						value={timezone}
						onChange={(e) => {
							onTimezone(e.target.value);
							onStart("");
						}}
					>
						{zones.map((zone) => (
							<option key={zone} value={zone}>
								{zone}
							</option>
						))}
					</select>
				</Field>
			</div>
			{slots.isPending || slots.isFetching ? (
				<p role="status">Loading available times…</p>
			) : slots.error ? (
				<div role="alert" className="space-y-3">
					<p>{slots.error.message}</p>
					<Button
						className="min-h-11"
						variant="outline"
						onClick={() => void slots.refetch()}
					>
						Retry available times
					</Button>
				</div>
			) : slots.data?.slots.length === 0 ? (
				<p className="rounded-lg border p-5 text-muted-foreground">
					No available times on this date. Choose another date.
				</p>
			) : (
				<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{slots.data?.slots.map((slot) => (
						<Button
							key={slot.start}
							data-testid="calendar-slot"
							className="h-auto min-h-11 min-w-0 flex-col whitespace-normal px-2 py-2"
							variant={start === slot.start ? "default" : "outline"}
							aria-pressed={start === slot.start}
							onClick={() => onStart(slot.start)}
						>
							{new Intl.DateTimeFormat(undefined, {
								hour: "numeric",
								minute: "2-digit",
								timeZoneName: "short",
								timeZone: timezone,
							}).format(new Date(slot.start))}
							{capacity > 1 && (
								<span className="text-xs">({slot.remaining} left)</span>
							)}
						</Button>
					))}
				</div>
			)}
		</section>
	);
}
