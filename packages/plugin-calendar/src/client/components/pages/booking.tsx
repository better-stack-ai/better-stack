"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import type { Booking } from "../../../types";
import { CALENDAR_PLUGIN_ID } from "../../constants";
import {
	useCalendarSlots,
	useCreateCalendarBooking,
	usePublicCalendarEvent,
} from "../../hooks";
import {
	CalendarPage,
	Field,
	calendarSelectClass,
	formatCalendarTime,
} from "../shared";

function today(timezone: string) {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: timezone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());
}

export function CalendarBookingPage({ slug }: { slug: string }) {
	const { data: event } = usePublicCalendarEvent(slug);
	const [timezone, setTimezone] = useState(event.timezone);
	const [date, setDate] = useState(() => today(event.timezone));
	const [start, setStart] = useState("");
	const [confirmation, setConfirmation] = useState<Booking>();
	const slots = useCalendarSlots(slug, date, timezone);
	const create = useCreateCalendarBooking();
	const { Link, resolve } = usePluginSiteNavigation(CALENDAR_PLUGIN_ID);
	useEffect(() => {
		const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		setTimezone(localZone);
		setDate(today(localZone));
	}, []);
	const zones = Array.from(
		new Set([timezone, "UTC", ...Intl.supportedValuesOf("timeZone")]),
	);
	const chosenSlot = slots.data?.slots.find((slot) => slot.start === start);
	const submit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!chosenSlot) return;
		const data = new FormData(e.currentTarget);
		try {
			const booking = await create.mutateAsync({
				slug,
				start,
				timezone,
				name: String(data.get("name")),
				email: String(data.get("email")),
			});
			setConfirmation(booking);
		} catch {
			// The mutation exposes its error beside the booking form.
		}
	};
	if (confirmation)
		return (
			<CalendarPage>
				<section aria-live="polite" className="max-w-xl space-y-4">
					<h1 className="text-2xl font-semibold sm:text-3xl">
						Booking confirmed
					</h1>
					<p>{confirmation.eventName}</p>
					<p>
						{formatCalendarTime(confirmation.start, confirmation.timezone)} (
						{confirmation.timezone})
					</p>
					{event.location && (
						<p className="break-words">Location: {event.location}</p>
					)}
					<p>Save this link to manage your booking.</p>
					<Button className="min-h-11" variant="outline" asChild>
						<Link
							href={
								resolve("calendar", "cancel", confirmation.cancelToken).href
							}
						>
							Manage or cancel booking
						</Link>
					</Button>
				</section>
			</CalendarPage>
		);
	return (
		<CalendarPage>
			<header className="max-w-2xl space-y-2">
				<h1 className="break-words text-2xl font-semibold sm:text-3xl">
					{event.name}
				</h1>
				<p className="text-muted-foreground">
					{event.duration} minutes ·{" "}
					{event.capacity === 1
						? "1:1 booking"
						: `Up to ${event.capacity} attendees`}
				</p>
				{event.description && (
					<p className="whitespace-pre-wrap break-words">{event.description}</p>
				)}
				{event.location && (
					<p className="break-words">Location: {event.location}</p>
				)}
			</header>
			<div className="grid min-w-0 gap-8 lg:grid-cols-2">
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
								min={today(timezone)}
								value={date}
								onChange={(e) => {
									if (e.target.value) {
										setDate(e.target.value);
										setStart("");
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
									setTimezone(e.target.value);
									setStart("");
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
									onClick={() => setStart(slot.start)}
								>
									{new Intl.DateTimeFormat(undefined, {
										hour: "numeric",
										minute: "2-digit",
										timeZoneName: "short",
										timeZone: timezone,
									}).format(new Date(slot.start))}
									{event.capacity > 1 && (
										<span className="text-xs">({slot.remaining} left)</span>
									)}
								</Button>
							))}
						</div>
					)}
				</section>
				<form
					onSubmit={submit}
					className="min-w-0 space-y-5 rounded-lg border p-4 sm:p-6"
				>
					<h2 className="text-xl font-semibold">Your details</h2>
					{chosenSlot ? (
						<p className="text-sm">
							{formatCalendarTime(chosenSlot.start, timezone)} ({timezone})
						</p>
					) : (
						<p className="text-sm text-muted-foreground">
							Select an available time to confirm your booking.
						</p>
					)}
					<Field id="calendar-name" label="Your name">
						<Input
							id="calendar-name"
							className="min-h-11"
							name="name"
							autoComplete="name"
							required
							maxLength={200}
						/>
					</Field>
					<Field id="calendar-email" label="Email">
						<Input
							id="calendar-email"
							className="min-h-11"
							name="email"
							type="email"
							autoComplete="email"
							required
							maxLength={320}
						/>
					</Field>
					{create.error && (
						<p role="alert" className="text-destructive">
							{create.error.message}
						</p>
					)}
					<Button
						className="min-h-11 w-full"
						type="submit"
						disabled={!chosenSlot || create.isPending || slots.isFetching}
					>
						{create.isPending ? "Confirming booking…" : "Confirm booking"}
					</Button>
				</form>
			</div>
		</CalendarPage>
	);
}
