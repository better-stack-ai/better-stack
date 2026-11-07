import type { CalendarPluginOverrides } from "./overrides";
import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	isConnectionError,
} from "@btst/stack/plugins/client";
import { defineRoute, defineRoutes } from "@btst/yar";
import { lazy, type ComponentType } from "react";
import {
	createCalendarQueryKeys,
	type CalendarIdentityPartition,
} from "../query-keys";
import { CALENDAR_PLUGIN_ID } from "./constants";
import type { EventType } from "../types";

const Dashboard = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CalendarDashboardPageComponent,
	})),
);
const Editor = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CalendarEventEditorPageComponent,
	})),
);
const Booking = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CalendarBookingPageComponent,
	})),
);
const Cancellation = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CalendarCancellationPageComponent,
	})),
);
const Reschedule = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CalendarReschedulePageComponent,
	})),
);

const Waitlist = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.CalendarWaitlistPageComponent,
	})),
);

/** Server prefetch context; path excludes the site's mounting base path. */
export interface CalendarLoaderContext {
	path: string;
	isSSR: boolean;
}

/** Calendar page customization; API, site and QueryClient come from the resolved stack. */
export interface CalendarClientConfig {
	/** Match the browser identity snapshot so protected SSR data hydrates the same cache. */
	identityPartition?: CalendarIdentityPartition;
	/** Server prefetch hooks. Loading errors stay in the query cache for route boundaries. */
	hooks?: {
		/** Runs before prefetch; throwing prevents loading the route's data. */
		beforeLoad?: (context: CalendarLoaderContext) => void | Promise<void>;
		/** Runs after all of the route's queries have loaded successfully. */
		afterLoad?: (context: CalendarLoaderContext) => void | Promise<void>;
		/** Reports a load failure once; reporting errors cannot reject the route loader. */
		onErrorLoad?: (
			error: Error,
			context: CalendarLoaderContext,
		) => void | Promise<void>;
	};
	/** Replace selected built-in pages; parameterized pages receive the route's params. */
	pageComponents?: {
		dashboard?: ComponentType;
		newEvent?: ComponentType;
		editEvent?: ComponentType<{ params: { id: string } }>;
		booking?: ComponentType<{ params: { slug: string } }>;
		cancellation?: ComponentType<{ params: { token: string } }>;
		reschedule?: ComponentType<{ params: { token: string } }>;
		waitlist?: ComponentType<{ params: { token: string } }>;
	};
}

export const calendarClientPlugin = (config: CalendarClientConfig = {}) =>
	defineClientPlugin<CalendarPluginOverrides>()({
		id: CALENDAR_PLUGIN_ID,
		resolve: (runtime) => {
			const queries = createCalendarQueryKeys(
				createApiClient({
					baseURL: runtime.api.baseURL,
					basePath: runtime.api.basePath,
					headers: runtime.api.headers,
					credentials: runtime.api.credentials,
				}),
			);
			const preload =
				(
					path: string,
					entries: {
						queryKey: readonly unknown[];
						queryFn: () => Promise<unknown>;
					}[] = [],
				) =>
				async () => {
					if (typeof window !== "undefined") return;
					const context = { path, isSSR: true };
					let reported = false;
					const report = async (error: unknown) => {
						if (reported) return;
						reported = true;
						if (isConnectionError(error))
							console.warn(
								"[btst/calendar] API unavailable during SSR prefetch.",
							);
						try {
							await config.hooks?.onErrorLoad?.(
								error instanceof Error ? error : new Error(String(error)),
								context,
							);
						} catch {
							// Error reporting cannot cause the loader to reject.
						}
					};
					try {
						await config.hooks?.beforeLoad?.(context);
						await Promise.all(
							entries.map((entry) =>
								runtime.queryClient.prefetchQuery({ ...entry, retry: false }),
							),
						);
						for (const entry of entries) {
							const error = runtime.queryClient.getQueryState(
								entry.queryKey,
							)?.error;
							if (error) {
								await report(error);
								return;
							}
						}
						await config.hooks?.afterLoad?.(context);
					} catch (error) {
						for (const entry of entries) {
							await runtime.queryClient.prefetchQuery({
								queryKey: entry.queryKey,
								queryFn: () => {
									throw createSanitizedSSRLoaderError();
								},
								retry: false,
								staleTime: 0,
							});
						}
						await report(error);
					}
				};
			const meta = (title: string) => [
				{ title },
				{ name: "robots", content: "noindex, nofollow" },
			];
			return {
				routes: () =>
					defineRoutes(
						{
							calendarDashboard: defineRoute("/calendar", {
								page: Dashboard,
								loader: preload("/calendar", [
									queries.calendarEvents.list(config.identityPartition),
									queries.calendarWaitlist.list(config.identityPartition),
									queries.calendarBookings.list(
										"upcoming",
										config.identityPartition,
									),
								]),
								meta: () => meta("Calendar"),
							}),
							calendarNewEvent: defineRoute("/calendar/events/new", {
								page: () => <Editor />,
								loader: preload("/calendar/events/new"),
								meta: () => meta("New event type"),
							}),
							calendarEditEvent: defineRoute("/calendar/events/:id/edit", {
								page: ({ params }) => <Editor id={params.id} />,
								loader: ({ params }) =>
									preload(`/calendar/events/${params.id}/edit`, [
										queries.calendarEvents.detail(
											params.id,
											config.identityPartition,
										),
									])(),
								meta: () => meta("Edit event type"),
							}),
							calendarBooking: defineRoute("/calendar/book/:slug", {
								page: ({ params }) => <Booking slug={params.slug} />,
								loader: ({ params }) =>
									preload(`/calendar/book/${params.slug}`, [
										queries.calendarPublicEvents.detail(params.slug),
									])(),
								meta: ({ params }) => {
									const event = runtime.queryClient.getQueryData<EventType>(
										queries.calendarPublicEvents.detail(params.slug).queryKey,
									);
									return [
										{ title: event?.name ?? "Book a time" },
										{
											name: "description",
											content:
												event?.description ??
												"Choose an available time to book.",
										},
									];
								},
							}),
							calendarWaitlist: defineRoute("/calendar/waitlist/:token", {
								page: ({ params }) => <Waitlist token={params.token} />,
								loader: ({ params }) =>
									preload(`/calendar/waitlist/${params.token}`, [
										queries.calendarWaitlist.detail(params.token),
									])(),
								meta: () => meta("Manage waitlist"),
							}),
							calendarCancellation: defineRoute("/calendar/cancel/:token", {
								page: ({ params }) => <Cancellation token={params.token} />,
								loader: ({ params }) =>
									preload(`/calendar/cancel/${params.token}`, [
										queries.calendarBookings.detail(params.token),
									])(),
								meta: () => meta("Manage booking"),
							}),
							calendarReschedule: defineRoute("/calendar/reschedule/:token", {
								page: ({ params }) => <Reschedule token={params.token} />,
								loader: ({ params }) =>
									preload(`/calendar/reschedule/${params.token}`, [
										queries.calendarBookings.detail(params.token),
									])(),
								meta: () => meta("Reschedule booking"),
							}),
						},
						{
							pages: {
								calendarDashboard: config.pageComponents?.dashboard,
								calendarNewEvent: config.pageComponents?.newEvent,
								calendarEditEvent: config.pageComponents?.editEvent,
								calendarBooking: config.pageComponents?.booking,
								calendarCancellation: config.pageComponents?.cancellation,
								calendarReschedule: config.pageComponents?.reschedule,
								calendarWaitlist: config.pageComponents?.waitlist,
							},
						},
					),
				sitemap: async () => [],
			};
		},
	});
