"use client";

import { useState } from "react";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import type { BookingCheckout } from "../../../types";
import { CALENDAR_PLUGIN_ID } from "../../constants";
import {
	useCalendarWaitlistEntry,
	useVerifyCalendarWaitlist,
	useCancelCalendarWaitlist,
	useAcceptCalendarWaitlistOffer,
} from "../../hooks";
import { CalendarPage, formatCalendarTime } from "../shared";
import { CalendarPayment } from "../payment";
import { CalendarInviteDownload } from "../invite-download";
import { openCalendarCheckout, useCheckoutContext } from "../checkout";

export function CalendarWaitlistPage({ token }: { token: string }) {
	const { data: entry, refetch, isFetching } = useCalendarWaitlistEntry(token);
	const verify = useVerifyCalendarWaitlist();
	const cancel = useCancelCalendarWaitlist();
	const accept = useAcceptCalendarWaitlistOffer();
	const [confirmation, setConfirmation] = useState<{
		token: string;
		booking: BookingCheckout;
	}>();
	const [checkoutError, setCheckoutError] = useState(false);
	const { Link, resolve } = usePluginSiteNavigation(CALENDAR_PLUGIN_ID);
	const isCurrent = useCheckoutContext(token);
	const booking =
		confirmation?.token === token ? confirmation.booking : undefined;
	const pending = verify.isPending || cancel.isPending || accept.isPending;
	const error = verify.error || cancel.error || accept.error;
	const offerExpired =
		!!entry.offerExpiresAt && Date.parse(entry.offerExpiresAt) <= Date.now();
	const expired =
		Date.parse(entry.expiresAt) <= Date.now() || entry.status === "expired";
	const active =
		!expired && ["unverified", "waiting", "offered"].includes(entry.status);
	const acceptOffer = async () => {
		try {
			const result = await accept.mutateAsync(token);
			if (!isCurrent()) return;
			setConfirmation({ token, booking: result });
			if (result.checkout?.redirectUrl) {
				try {
					openCalendarCheckout(result, result.checkout.redirectUrl);
				} catch {
					setCheckoutError(true);
				}
			}
		} catch {
			// The mutation exposes offer expiry and booking errors below.
		}
	};
	return (
		<CalendarPage>
			<section className="max-w-xl space-y-5" aria-live="polite">
				<h1 className="text-2xl font-semibold sm:text-3xl">
					{booking
						? booking.status === "pending_payment"
							? "Booking awaiting payment"
							: booking.status === "cancelled"
								? "Booking cancelled"
								: "Booking confirmed"
						: "Manage waitlist"}
				</h1>
				<h2 className="break-words text-xl">{entry.eventName}</h2>
				<p>
					{formatCalendarTime(entry.start, entry.timezone)} ({entry.timezone})
				</p>
				{booking ? (
					<>
						{booking.status === "cancelled" ? (
							<p>Your booking has been cancelled.</p>
						) : (
							<>
								<CalendarPayment booking={booking} />
								<CalendarInviteDownload booking={booking} />
							</>
						)}
						{checkoutError && (
							<p role="alert">
								Save your private booking link and enable browser storage before
								continuing payment.
							</p>
						)}
						<Button className="min-h-11" variant="outline" asChild>
							<Link
								href={resolve("calendar", "cancel", booking.cancelToken).href}
							>
								Manage or cancel booking
							</Link>
						</Button>
					</>
				) : entry.status === "cancelled" ? (
					<p>Your waitlist entry has been cancelled.</p>
				) : entry.status === "accepted" ? (
					<>
						<p>
							Your offer has been accepted. View your booking to manage it or
							continue payment.
						</p>
						<Button
							className="min-h-11"
							disabled={pending}
							onClick={() => void acceptOffer()}
						>
							{accept.isPending ? "Loading booking…" : "View booking"}
						</Button>
					</>
				) : expired ? (
					<p>Your waitlist entry has expired. No booking was confirmed.</p>
				) : entry.status === "unverified" ? (
					<>
						<p>
							Verify your email to join the waitlist for this time. This does
							not confirm a booking or charge you.
						</p>
						<Button
							className="min-h-11"
							disabled={pending}
							onClick={() => verify.mutate(token)}
						>
							{verify.isPending
								? "Verifying email…"
								: "Verify email and join waitlist"}
						</Button>
					</>
				) : entry.status === "offered" && !offerExpired ? (
					<>
						<p>
							A place is available. Accept by{" "}
							{formatCalendarTime(entry.offerExpiresAt!, entry.timezone)} (
							{entry.timezone}).
						</p>
						<p className="text-sm text-muted-foreground">
							Accepting follows the event's usual booking and payment rules.
							Paid bookings remain pending until payment is confirmed.
						</p>
						<Button
							className="min-h-11"
							disabled={pending}
							onClick={() => void acceptOffer()}
						>
							{accept.isPending ? "Accepting offer…" : "Accept offer"}
						</Button>
					</>
				) : (
					<p>
						{offerExpired
							? "This offer has expired. No booking was confirmed."
							: "You are on the waitlist. If a place opens, you will receive a time-limited offer. No booking is confirmed yet."}
					</p>
				)}
				{error && (
					<p role="alert" className="text-destructive">
						{error.message}
					</p>
				)}
				{!booking && active && (
					<div className="flex flex-wrap gap-3">
						<Button
							className="min-h-11"
							variant="outline"
							disabled={pending || isFetching}
							onClick={() => void refetch()}
						>
							Check waitlist status
						</Button>
						<Button
							className="min-h-11"
							variant="destructive"
							disabled={pending}
							onClick={() => cancel.mutate(token)}
						>
							{cancel.isPending ? "Leaving waitlist…" : "Leave waitlist"}
						</Button>
					</div>
				)}
				<p className="text-sm text-muted-foreground">
					Keep this private link secure. Anyone with it can manage this waitlist
					entry.
				</p>
			</section>
		</CalendarPage>
	);
}
