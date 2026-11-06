"use client";

import { Button } from "@workspace/ui/components/button";
import { useCalendarBooking, useCancelCalendarBooking } from "../../hooks";
import { CalendarPage, formatCalendarTime } from "../shared";

export function CalendarCancellationPage({ token }: { token: string }) {
	const { data } = useCalendarBooking(token);
	const cancel = useCancelCalendarBooking();
	const booking = cancel.data ?? data;
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
				{booking.status === "cancelled" ? (
					<p>Your booking has been cancelled.</p>
				) : (
					<>
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
