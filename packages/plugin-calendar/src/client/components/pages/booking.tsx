"use client";

import { useEffect, useState, type FormEvent } from "react";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import type { BookingCheckout } from "../../../types";
import { CALENDAR_PLUGIN_ID } from "../../constants";
import {
	useCalendarSlots,
	useCreateCalendarBooking,
	usePublicCalendarEvent,
} from "../../hooks";
import {
	CalendarPage,
	Field,
	formatCalendarTime,
	formatCalendarPrice,
} from "../shared";
import {
	openCalendarCheckout,
	takeCalendarCheckoutToken,
	useCheckoutContext,
} from "../checkout";
import { CalendarPayment } from "../payment";
import { CalendarInviteDownload } from "../invite-download";
import { CalendarTimePicker, calendarToday } from "../time-picker";

export function CalendarBookingPage({ slug }: { slug: string }) {
	const { data: event } = usePublicCalendarEvent(slug);
	const [timezone, setTimezone] = useState(event.timezone);
	const [date, setDate] = useState(() => calendarToday(event.timezone));
	const [start, setStart] = useState("");
	const [checkoutError, setCheckoutError] = useState(false);
	const [confirmation, setConfirmation] = useState<BookingCheckout>();
	const slots = useCalendarSlots(slug, date, timezone);
	const create = useCreateCalendarBooking();
	const { Link, resolve, navigate } =
		usePluginSiteNavigation(CALENDAR_PLUGIN_ID);
	useEffect(() => {
		const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		setTimezone(localZone);
		setDate(calendarToday(localZone));
	}, []);
	useEffect(() => {
		if (confirmation) return;
		const token = takeCalendarCheckoutToken(event.id);
		if (token) void navigate("calendar", "cancel", token);
	}, [event.id, navigate, confirmation]);
	const isCurrentCheckout = useCheckoutContext(
		JSON.stringify([event.id, slug]),
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
			if (!isCurrentCheckout()) return;
			setConfirmation(booking);
			if (booking.checkout?.redirectUrl) {
				try {
					openCalendarCheckout(booking, booking.checkout.redirectUrl);
				} catch {
					setCheckoutError(true);
				}
			}
		} catch {
			// The mutation exposes its error beside the booking form.
		}
	};
	if (confirmation)
		return (
			<CalendarPage>
				<section aria-live="polite" className="max-w-xl space-y-4">
					<h1 className="text-2xl font-semibold sm:text-3xl">
						{confirmation.status === "pending_payment"
							? "Booking awaiting payment"
							: "Booking confirmed"}
					</h1>
					<CalendarPayment booking={confirmation} />
					{checkoutError && (
						<p role="alert">
							Browser storage is unavailable. Save your private booking link and
							enable browser storage before continuing payment.
						</p>
					)}
					<p>{confirmation.eventName}</p>
					<p>
						{formatCalendarTime(confirmation.start, confirmation.timezone)} (
						{confirmation.timezone})
					</p>
					{event.location && (
						<p className="break-words">Location: {event.location}</p>
					)}
					<p>Save this link to manage your booking.</p>
					<CalendarInviteDownload booking={confirmation} />
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
				{(event.price ?? 0) > 0 && event.currency && (
					<p>
						Price: {formatCalendarPrice(event.price!, event.currency)}. Payment
						is required to confirm your booking.
					</p>
				)}
			</header>
			<div className="grid min-w-0 gap-8 lg:grid-cols-2">
				<CalendarTimePicker
					page="calendarBooking"
					date={date}
					timezone={timezone}
					start={start}
					onDate={setDate}
					onTimezone={setTimezone}
					onStart={setStart}
					slots={slots}
					capacity={event.capacity}
				/>
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
						{create.isPending
							? "Reserving booking…"
							: (event.price ?? 0) > 0
								? "Reserve pending payment"
								: "Confirm booking"}
					</Button>
				</form>
			</div>
		</CalendarPage>
	);
}
