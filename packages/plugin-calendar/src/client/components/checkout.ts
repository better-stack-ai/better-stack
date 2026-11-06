"use client";
import { useEffect, useRef } from "react";
import type { Booking } from "../../types";

const checkoutKey = (eventTypeId: string) =>
	`btst:calendar:checkout:${eventTypeId}`;

/** Keep the private management link available when hosted checkout returns to the public booking page. */
export function openCalendarCheckout(booking: Booking, redirectUrl: string) {
	sessionStorage.setItem(checkoutKey(booking.eventTypeId), booking.cancelToken);
	window.location.assign(redirectUrl);
}

/** Consume the token once; the management route then owns it in its URL. */
export function takeCalendarCheckoutToken(eventTypeId: string) {
	try {
		const key = checkoutKey(eventTypeId);
		const token = sessionStorage.getItem(key);
		if (token) sessionStorage.removeItem(key);
		return token;
	} catch {
		return null;
	}
}

/** Check a pending checkout response against the still-mounted booking context. */
export function useCheckoutContext(context: string) {
	const current = useRef<string | null>(context);
	current.current = context;
	useEffect(() => {
		current.current = context;
		return () => {
			current.current = null;
		};
	}, [context]);
	return () => current.current === context;
}
