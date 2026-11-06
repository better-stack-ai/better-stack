"use client";

import { useState } from "react";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import type { Booking } from "../../../types";
import {
	useCalendarBooking,
	useCalendarRescheduleSlots,
	useRescheduleCalendarBooking,
} from "../../hooks";
import { CALENDAR_PLUGIN_ID } from "../../constants";
import { CalendarPage, formatCalendarTime } from "../shared";
import { CalendarTimePicker } from "../time-picker";
import { CalendarInviteDownload } from "../invite-download";

export function CalendarReschedulePage({ token }: { token: string }) {
	const { data: booking } = useCalendarBooking(token);
	return booking.status === "cancelled" ||
		Date.parse(booking.start) <= Date.now() ? (
		<CalendarPage>
			<h1 className="text-2xl font-semibold">Booking cannot be rescheduled</h1>
			<p>Only upcoming active bookings can be rescheduled.</p>
		</CalendarPage>
	) : (
		<RescheduleForm token={token} booking={booking} />
	);
}

function RescheduleForm({
	token,
	booking,
}: {
	token: string;
	booking: Booking;
}) {
	const [timezone, setTimezone] = useState(booking.timezone);
	const [date, setDate] = useState(() =>
		new Intl.DateTimeFormat("en-CA", {
			timeZone: booking.timezone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		}).format(new Date(booking.start)),
	);
	const [start, setStart] = useState("");
	const slots = useCalendarRescheduleSlots(token, date, timezone);
	const reschedule = useRescheduleCalendarBooking();
	const { Link, resolve } = usePluginSiteNavigation(CALENDAR_PLUGIN_ID);
	const chosen = slots.data?.slots.find((slot) => slot.start === start);
	const current = reschedule.data ?? booking;
	return (
		<CalendarPage>
			<header className="space-y-3">
				<h1 className="text-2xl font-semibold sm:text-3xl">
					{reschedule.data ? "Booking rescheduled" : "Reschedule booking"}
				</h1>
				<h2 className="break-words text-xl">{booking.eventName}</h2>
				<p aria-live="polite">
					{formatCalendarTime(current.start, current.timezone)} (
					{current.timezone})
				</p>
			</header>
			{reschedule.data ? (
				<section className="space-y-4" aria-live="polite">
					<p>
						{reschedule.data.status === "pending_payment"
							? "Your time has moved. Payment is still pending."
							: "Your booking has moved to the new time."}
					</p>
					<CalendarInviteDownload booking={reschedule.data} />
				</section>
			) : (
				<div className="max-w-xl space-y-5">
					<p>
						Your current time stays reserved until the new time is confirmed.
					</p>
					<CalendarTimePicker
						date={date}
						timezone={timezone}
						start={start}
						onDate={setDate}
						onTimezone={setTimezone}
						onStart={setStart}
						slots={slots}
					/>
					{reschedule.error && (
						<p role="alert" className="text-destructive">
							{reschedule.error.message}
						</p>
					)}
					<Button
						className="min-h-11"
						disabled={!chosen || reschedule.isPending || slots.isFetching}
						onClick={() => reschedule.mutate({ token, start, timezone })}
					>
						{reschedule.isPending ? "Moving booking…" : "Confirm new time"}
					</Button>
				</div>
			)}
			<Link
				className="inline-flex min-h-11 items-center underline underline-offset-4"
				href={resolve("calendar", "cancel", token).href}
			>
				Manage booking
			</Link>
		</CalendarPage>
	);
}
