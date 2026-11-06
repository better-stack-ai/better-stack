import type { Booking } from "./types";

function escapeText(value: string) {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/\r\n|\r|\n/g, "\\n")
		.replace(/[,;]/g, "\\$&");
}

function foldLine(value: string) {
	const encoder = new TextEncoder();
	let line = "";
	let length = 0;
	for (const character of value) {
		const size = encoder.encode(character).length;
		if (length + size > 75) {
			line += "\r\n ";
			length = 1;
		}
		line += character;
		length += size;
	}
	return line;
}

/** RFC 5545 invite with UTC instants, a stable UID, escaped text and UTF-8 line folding. No bearer token is included. */
export function generateBookingInvite(
	booking: Pick<
		Booking,
		"id" | "eventName" | "start" | "end" | "createdAt" | "status"
	>,
) {
	const timestamp = (value: string) =>
		new Date(value)
			.toISOString()
			.replace(/[-:]/g, "")
			.replace(/\.\d{3}Z$/, "Z");
	return (
		[
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//BTST//Calendar//EN",
			"CALSCALE:GREGORIAN",
			"BEGIN:VEVENT",
			`UID:${escapeText(booking.id)}@btst-calendar`,
			`DTSTAMP:${timestamp(booking.createdAt)}`,
			`DTSTART:${timestamp(booking.start)}`,
			`DTEND:${timestamp(booking.end)}`,
			`SUMMARY:${escapeText(booking.eventName)}`,
			`STATUS:${booking.status === "cancelled" ? "CANCELLED" : booking.status === "pending_payment" ? "TENTATIVE" : "CONFIRMED"}`,
			"END:VEVENT",
			"END:VCALENDAR",
		]
			.map(foldLine)
			.join("\r\n") + "\r\n"
	);
}
