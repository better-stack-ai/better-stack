import api = require("@btst/plugin-calendar/api");
import client = require("@btst/plugin-calendar/client");
import hooks = require("@btst/plugin-calendar/client/hooks");
import components = require("@btst/plugin-calendar/client/components");
import queries = require("@btst/plugin-calendar/query-keys");
import permissions = require("@btst/plugin-calendar/permissions");
import type {
	EventType,
	Booking,
	Availability,
	DateOverride,
} from "@btst/plugin-calendar/types";
import type {
	CalendarEventInput,
	CalendarBookingInput,
} from "@btst/plugin-calendar/query-keys";
const backend = api.calendarBackendPlugin();
const frontend = client.calendarClientPlugin();
const id: "calendar" = frontend.id;
const booking: CalendarBookingInput = {
	slug: "consultation",
	start: "2035-01-01T14:00:00Z",
	timezone: "UTC",
	name: "Guest",
	email: "guest@example.test",
};
// @ts-expect-error Caller cannot override the authoritative host identity.
const invalid: CalendarBookingInput = { ...booking, hostId: "other" };
export {
	backend,
	frontend,
	id,
	booking,
	invalid,
	hooks,
	components,
	queries,
	permissions,
};
export type {
	EventType,
	Booking,
	Availability,
	DateOverride,
	CalendarEventInput,
};
