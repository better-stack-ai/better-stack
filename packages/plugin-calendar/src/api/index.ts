export { calendarBackendPlugin, type CalendarApiRouter } from "./plugin";
export type {
	CalendarBackendHooks,
	CalendarConfirmationContext,
	CalendarBackendOptions,
	CalendarBackendConfig,
} from "./operations";
export { calendarSchema } from "../db";
export * from "../types";
export {
	getEventType,
	getEventTypeBySlug,
	listEventTypes,
	getBookingById,
	getBookingByToken,
	listHostBookings,
	getWaitlistByToken,
	listHostWaitlist,
} from "./getters";
export {
	createEventType,
	updateEventType,
	deleteEventType,
	createBooking,
	cancelBooking,
	rescheduleBooking,
	confirmBookingPayment,
	createWaitlistEntry,
	updateWaitlistEntry,
} from "./mutations";
export { generateBookingInvite } from "../ical";

export type {
	CalendarProviderAdapter,
	CalendarProviderConnection,
	CalendarProviders,
} from "./providers";
export {
	googleCalendarAdapter,
	microsoftCalendarAdapter,
	type CalendarProviderCredentials,
} from "./provider-adapters";
