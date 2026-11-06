"use client";

import { Button } from "@workspace/ui/components/button";
import { generateBookingInvite } from "../hooks";
import type { Booking } from "../../types";

export function CalendarInviteDownload({
	booking,
}: {
	booking: Omit<Booking, "cancelToken">;
}) {
	return (
		<Button className="min-h-11" variant="outline" asChild>
			<a
				download="booking.ics"
				href={`data:text/calendar;charset=utf-8,${encodeURIComponent(generateBookingInvite(booking))}`}
			>
				Download calendar invite (.ics)
			</a>
		</Button>
	);
}
