import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const eventFacts = { eventTypeId: z.string(), hostId: z.string() };
const hostFacts = { hostId: z.string().optional() };
const bookingFacts = { bookingId: z.string(), hostId: z.string() };

export const calendarPermissions = definePermissions("calendar", {
	eventType: {
		list: permission(z.object(hostFacts)),
		read: permission(z.object({ ...eventFacts, public: z.boolean() })),
		create: permission(z.object(hostFacts)),
		update: permission(z.object(eventFacts)),
		delete: permission(z.object(eventFacts)),
	},
	availability: { read: permission(z.object(eventFacts)) },
	booking: {
		list: permission(z.object(hostFacts)),
		create: permission(z.object(eventFacts)),
		read: permission(z.object({ ...bookingFacts, tokenValid: z.boolean() })),
		cancel: permission(z.object({ ...bookingFacts, tokenValid: z.boolean() })),
		reschedule: permission(
			z.object({ ...bookingFacts, tokenValid: z.boolean() }),
		),
		confirmPayment: permission(z.object(bookingFacts)),
		remind: permission(z.object(bookingFacts)),
	},
});
