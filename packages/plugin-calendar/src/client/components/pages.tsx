"use client";

import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { calendarPermissions } from "../../permissions";
import { CalendarError, CalendarLoading, CalendarNotFound } from "./shared";

const Dashboard = lazy(() =>
	import("./pages/dashboard").then((m) => ({
		default: m.CalendarDashboardPage,
	})),
);
const Editor = lazy(() =>
	import("./pages/event-editor").then((m) => ({
		default: m.CalendarEventEditorPage,
	})),
);
const Booking = lazy(() =>
	import("./pages/booking").then((m) => ({ default: m.CalendarBookingPage })),
);
const Cancellation = lazy(() =>
	import("./pages/cancellation").then((m) => ({
		default: m.CalendarCancellationPage,
	})),
);
const Reschedule = lazy(() =>
	import("./pages/reschedule").then((m) => ({
		default: m.CalendarReschedulePage,
	})),
);

const boundary = {
	ErrorComponent: CalendarError,
	LoadingComponent: CalendarLoading,
	NotFoundComponent: CalendarNotFound,
	onError: (error: Error) => console.error("[btst/calendar]", error),
};

export function CalendarDashboardPageComponent() {
	return (
		<ComposedRoute
			{...boundary}
			path="/calendar"
			permission={calendarPermissions.eventType.list({})}
			PageComponent={Dashboard}
		/>
	);
}

export function CalendarEventEditorPageComponent({ id }: { id?: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={id ? `/calendar/events/${id}/edit` : "/calendar/events/new"}
			permission={id ? undefined : calendarPermissions.eventType.create({})}
			PageComponent={Editor}
			props={{ id }}
		/>
	);
}

export function CalendarBookingPageComponent({ slug }: { slug: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/calendar/book/${slug}`}
			PageComponent={Booking}
			props={{ slug }}
		/>
	);
}

export function CalendarCancellationPageComponent({
	token,
}: {
	token: string;
}) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/calendar/cancel/${token}`}
			PageComponent={Cancellation}
			props={{ token }}
		/>
	);
}

export function CalendarReschedulePageComponent({ token }: { token: string }) {
	return (
		<ComposedRoute
			{...boundary}
			path={`/calendar/reschedule/${token}`}
			PageComponent={Reschedule}
			props={{ token }}
		/>
	);
}
