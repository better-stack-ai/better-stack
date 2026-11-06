"use client";

import { Button } from "@workspace/ui/components/button";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { CALENDAR_PLUGIN_ID } from "../../constants";
import { CalendarInviteDownload } from "../invite-download";
import { useCalendarBooking, useCancelCalendarBooking } from "../../hooks";
import { CalendarPage, formatCalendarTime } from "../shared";

export function CalendarCancellationPage({ token }: { token: string }) {
	const { data } = useCalendarBooking(token);
	const cancel = useCancelCalendarBooking();
	const booking = cancel.data ?? data;
	const { Link, resolve } = usePluginSiteNavigation(CALENDAR_PLUGIN_ID);
	return (
		<CalendarPage>
			<section className="max-w-xl space-y-5" aria-live="polite">
				<h1 className="text-2xl font-semibold sm:text-3xl">
					{booking.status === "cancelled"
						? "Booking cancelled"
						: "Manage booking"}
				</h1>
				<h2 className="break-words text-xl">{booking.eventName}</h2>
				<p>
					{formatCalendarTime(booking.start, booking.timezone)} (
					{booking.timezone})
				</p>
				{booking.status === "pending_payment" && (
					<p>
						Payment pending. Your time is held until the host confirms payment
						or the booking is cancelled.
					</p>
				)}
				<CalendarInviteDownload booking={booking} />
				{booking.status === "cancelled" ? (
					<p>Your booking has been cancelled.</p>
				) : (
					<>
						{Date.parse(booking.start) > Date.now() && (
							<Button className="min-h-11" variant="outline" asChild>
								<Link href={resolve("calendar", "reschedule", token).href}>
									Reschedule booking
								</Link>
							</Button>
						)}
						<p>Cancel this booking if you can no longer attend.</p>
						{cancel.error && (
							<p role="alert" className="text-destructive">
								{cancel.error.message}
							</p>
						)}
						<Button
							className="min-h-11"
							variant="destructive"
							disabled={cancel.isPending}
							onClick={() => cancel.mutate(token)}
						>
							{cancel.isPending ? "Cancelling booking…" : "Cancel booking"}
						</Button>
					</>
				)}
			</section>
		</CalendarPage>
	);
}
