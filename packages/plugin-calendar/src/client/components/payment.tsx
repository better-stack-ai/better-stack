"use client";
import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { usePluginOverrides } from "@btst/stack/context";
import type { BookingCheckout } from "../../types";
import type { CalendarPluginOverrides } from "../overrides";
import { CALENDAR_PLUGIN_ID } from "../constants";
import { openCalendarCheckout, useCheckoutContext } from "./checkout";
import { useCalendarBookingCheckout } from "../hooks";

/** Token-authorized checkout retry; credentials stay in this component's mutation response. */
export function CalendarPayment({ booking }: { booking: BookingCheckout }) {
	const retry = useCalendarBookingCheckout();
	const [redirectError, setRedirectError] = useState(false);
	const overrides =
		usePluginOverrides<CalendarPluginOverrides>(CALENDAR_PLUGIN_ID);
	const result =
		retry.data?.id === booking.id &&
		retry.data.cancelToken === booking.cancelToken
			? retry.data
			: booking;
	const isCurrentCheckout = useCheckoutContext(
		JSON.stringify([booking.id, booking.cancelToken]),
	);
	const resume = async () => {
		try {
			const next = await retry.mutateAsync(booking.cancelToken);
			if (!isCurrentCheckout()) return;
			if (next.checkout?.redirectUrl)
				openCalendarCheckout(next, next.checkout.redirectUrl);
		} catch {
			if (isCurrentCheckout()) setRedirectError(true);
		}
	};
	if (booking.status !== "pending_payment") return null;
	if (!booking.hasCheckout)
		return (
			<p role="status">
				Payment pending. Your time is held until the host confirms payment or
				the booking is cancelled.
			</p>
		);
	return (
		<div className="flex flex-col gap-3">
			<p role="status">Your time is held while payment is pending.</p>
			{result.checkout?.clientSecret ? (
				(overrides.renderPayment?.(result.checkout) ?? (
					<p>Payment form unavailable. Contact the host for help.</p>
				))
			) : (
				<Button
					className="min-h-11"
					disabled={retry.isPending}
					onClick={() => void resume()}
				>
					{retry.isPending ? "Opening checkout…" : "Continue payment"}
				</Button>
			)}
			{(result.checkoutError || retry.error || redirectError) && (
				<p role="alert">
					Payment could not be opened. Please try again or contact the host.
				</p>
			)}
		</div>
	);
}
