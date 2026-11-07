import type { CalendarProviderAdapter } from "@btst/plugin-calendar/api";

/** Local provider fixture: no external accounts, credentials, or network requests. */
export function createCalendarProviderDemo(
	provider: "google" | "microsoft",
): CalendarProviderAdapter {
	const events = new Map<string, { eventId: string }>();
	const timedOut = new Set<string>();
	return {
		async connect({ hostId }) {
			return {
				accountId: `${provider}-${hostId}`,
				label: `Demo ${provider === "google" ? "Google" : "Microsoft"} account`,
			};
		},
		async disconnect() {},
		async listCalendars() {
			return [
				{ id: "personal", name: "Personal" },
				{ id: "appointments", name: "Appointments" },
			];
		},
		async getBusyIntervals() {
			return [];
		},
		async ensureEvent(_connection, { syncKey, booking }) {
			const event = events.get(syncKey) ?? {
				eventId: `demo-${provider}-${events.size + 1}`,
			};
			events.set(syncKey, event);
			// Model a lost response after creation; the next attempt reconciles the same event.
			if (
				booking.eventName.startsWith("Provider retry") &&
				!timedOut.has(syncKey)
			) {
				timedOut.add(syncKey);
				throw new Error("Demo provider timeout after creating an event");
			}
			return event;
		},
		async deleteEvent(_connection, { syncKey }) {
			events.delete(syncKey);
		},
	};
}
