import { calendarClientPlugin } from "@btst/plugin-calendar/client";
import {
	CalendarBookingPageComponent,
	CalendarEventEditorPageComponent,
	CalendarCancellationPageComponent,
} from "@btst/plugin-calendar/client/components";
import { calendarPermissions } from "@btst/plugin-calendar/permissions";
import "@btst/plugin-calendar/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";
const event = {
	id: "event",
	hostId: "host",
	slug: "consultation",
	name: "Packed consultation",
	duration: 30,
	capacity: 2,
	timezone: "UTC",
	description: "Existing Calendar booking",
	location: "Office",
	weeklyAvailability: [],
	dateOverrides: [],
	limits: {},
	active: true,
	createdAt: "2025-01-01T00:00:00Z",
	updatedAt: "2025-01-01T00:00:00Z",
};
const booking = {
	id: "booking",
	eventTypeId: "event",
	hostId: "host",
	eventName: event.name,
	start: "2035-01-01T14:00:00.000Z",
	end: "2035-01-01T14:30:00.000Z",
	timezone: "America/New_York",
	name: "Guest",
	email: "guest@example.test",
	status: "confirmed",
	cancelToken: "packed-private-token",
	createdAt: "2025-01-01T00:00:00Z",
};
globalThis.fetch = async (input, init) => {
	const url = new URL(String(input));
	const body = init?.body ? JSON.parse(String(init.body)) : undefined;
	if (url.pathname.endsWith("/calendar/events") && init?.method === "POST") {
		localStorage.setItem("packed-calendar-event", JSON.stringify(body));
		return Response.json({ ...event, ...body });
	}
	if (url.pathname.endsWith("/slots"))
		return Response.json({
			date: url.searchParams.get("date"),
			timezone: url.searchParams.get("timezone"),
			slots: [{ start: booking.start, end: booking.end, remaining: 2 }],
		});
	if (url.pathname.endsWith("/calendar/book/consultation")) {
		if (init?.method === "POST") {
			localStorage.setItem("packed-calendar-booking", JSON.stringify(body));
			return Response.json({ ...booking, ...body });
		}
		return Response.json(event);
	}
	if (url.pathname.endsWith("/calendar/cancel/packed-private-token")) {
		if (init?.method === "POST") {
			localStorage.setItem("packed-calendar-cancelled", "yes");
			return Response.json({ ...booking, status: "cancelled" });
		}
		return Response.json(booking);
	}
	throw new Error(`Unexpected Calendar request ${input}`);
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { calendar: calendarClientPlugin() },
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [calendarPermissions],
	rules: ({ calendar }) => [calendar.eventType.create.allow()],
});
const identity = { id: "host" };
const mode = new URLSearchParams(location.search).get("mode");
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({ authorization, getIdentity: () => identity })}
			initialIdentity={identity}
		>
			{mode === "editor" ? (
				<CalendarEventEditorPageComponent />
			) : mode === "cancel" ? (
				<CalendarCancellationPageComponent token="packed-private-token" />
			) : (
				<CalendarBookingPageComponent slug="consultation" />
			)}
		</StackProvider>
	</QueryClientProvider>,
);
