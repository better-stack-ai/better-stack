"use client";

import { useState } from "react";
import { useRegisterPageAIContext } from "@btst/stack/page-context";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { calendarPermissions } from "../../../permissions";
import { CALENDAR_PLUGIN_ID } from "../../constants";
import {
	useCalendarBookings,
	useCalendarWaitlist,
	useCalendarEvents,
	useCancelHostCalendarBooking,
	useDeleteCalendarEvent,
} from "../../hooks";
import { CalendarPage, formatCalendarTime } from "../shared";
import { CalendarInviteDownload } from "../invite-download";
import { CalendarConnectionsSection } from "../connections";

export function CalendarDashboardPage() {
	const { data: events } = useCalendarEvents();
	const remove = useDeleteCalendarEvent();
	const { Link, resolve } = usePluginSiteNavigation(CALENDAR_PLUGIN_ID);
	useRegisterPageAIContext({
		routeName: "calendar-admin",
		pageDescription: JSON.stringify({
			page: "Read-only Calendar dashboard summary. No mutation tools are available.",
			eventTypes: events.length,
			acceptingBookings: events.filter((event) => event.active).length,
		}),
	});
	return (
		<CalendarPage>
			<header className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<h1 className="text-2xl font-semibold sm:text-3xl">Calendar</h1>
					<p className="mt-1 text-muted-foreground">
						Manage event types and scheduled bookings.
					</p>
				</div>
				<PermissionAccess permission={calendarPermissions.eventType.create({})}>
					<Button className="min-h-11" asChild>
						<Link href={resolve("calendar", "events", "new").href}>
							New event type
						</Link>
					</Button>
				</PermissionAccess>
			</header>
			<PermissionAccess permission={calendarPermissions.connection.list({})}>
				<CalendarConnectionsSection />
			</PermissionAccess>
			<section aria-labelledby="calendar-events-heading" className="space-y-4">
				<h2 id="calendar-events-heading" className="text-xl font-semibold">
					Event types
				</h2>
				{remove.error && (
					<p role="alert" className="text-destructive">
						{remove.error.message}
					</p>
				)}
				{events.length === 0 ? (
					<p className="rounded-lg border p-6 text-muted-foreground">
						No event types yet. Create one to set your availability and share a
						booking page.
					</p>
				) : (
					<ul className="divide-y rounded-lg border">
						{events.map((event) => (
							<li
								key={event.id}
								className="flex min-w-0 flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
							>
								<div className="min-w-0">
									<h3 className="break-words font-medium">{event.name}</h3>
									<p className="text-sm text-muted-foreground">
										{event.duration} minutes ·{" "}
										{event.capacity === 1
											? "1:1"
											: `Up to ${event.capacity} attendees`}{" "}
										· {event.active ? "Accepting bookings" : "Paused"}
									</p>
									<p className="break-words text-sm text-muted-foreground">
										{event.teamAvailabilityIds?.length
											? `Team booking · ${event.teamAvailabilityIds.length} eligible hosts · capacity per host`
											: `Availability event ID: ${event.id}`}
									</p>
								</div>
								<div className="flex flex-wrap gap-2">
									{event.active && (
										<Button className="min-h-11" variant="outline" asChild>
											<Link href={resolve("calendar", "book", event.slug).href}>
												Booking page
											</Link>
										</Button>
									)}
									<PermissionAccess
										permission={calendarPermissions.eventType.update({
											eventTypeId: event.id,
											hostId: event.hostId,
										})}
									>
										<Button className="min-h-11" variant="outline" asChild>
											<Link
												href={
													resolve("calendar", "events", event.id, "edit").href
												}
											>
												Edit<span className="sr-only"> {event.name}</span>
											</Link>
										</Button>
									</PermissionAccess>
									<PermissionAccess
										permission={calendarPermissions.eventType.delete({
											eventTypeId: event.id,
											hostId: event.hostId,
										})}
									>
										<Button
											className="min-h-11"
											variant="ghost"
											disabled={remove.isPending}
											onClick={() => {
												if (
													window.confirm(
														`Delete ${event.name}? Existing bookings must be cancelled first.`,
													)
												)
													remove.mutate(event.id);
											}}
										>
											Delete<span className="sr-only"> {event.name}</span>
										</Button>
									</PermissionAccess>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
			<PermissionAccess permission={calendarPermissions.booking.list({})}>
				{events.some((event) => event.waitlistEnabled) && <WaitlistSection />}
				<BookingsSection />
			</PermissionAccess>
		</CalendarPage>
	);
}

function BookingsSection() {
	const [period, setPeriod] = useState<"upcoming" | "past">("upcoming");
	const { data: bookings } = useCalendarBookings(period);
	const cancel = useCancelHostCalendarBooking();
	return (
		<section aria-labelledby="calendar-bookings-heading" className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 id="calendar-bookings-heading" className="text-xl font-semibold">
					Bookings
				</h2>
				<div className="flex gap-2" aria-label="Booking period">
					{(["upcoming", "past"] as const).map((value) => (
						<Button
							key={value}
							className="min-h-11"
							variant={period === value ? "default" : "outline"}
							aria-pressed={period === value}
							onClick={() => setPeriod(value)}
						>
							{value === "upcoming" ? "Upcoming" : "Past"}
						</Button>
					))}
				</div>
			</div>
			{cancel.error && (
				<p role="alert" className="text-destructive">
					{cancel.error.message}
				</p>
			)}
			{bookings.length === 0 ? (
				<p className="rounded-lg border p-6 text-muted-foreground">
					No {period} bookings.
				</p>
			) : (
				<ul className="divide-y rounded-lg border">
					{bookings.map((booking) => (
						<li key={booking.id} className="space-y-1 p-4 sm:p-5">
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<h3 className="break-words font-medium">{booking.eventName}</h3>
								<span className="text-sm">
									{booking.status === "cancelled"
										? "Cancelled"
										: booking.status === "pending_payment"
											? "Payment pending"
											: "Confirmed"}
								</span>
							</div>
							<p>
								{formatCalendarTime(booking.start, booking.timezone)} (
								{booking.timezone})
							</p>
							<p className="break-words text-sm text-muted-foreground">
								{booking.name} · {booking.email}
							</p>
							<p className="break-words text-sm text-muted-foreground">
								Assigned host: {booking.hostId}
							</p>
							<CalendarInviteDownload booking={booking} />
							{booking.status !== "cancelled" && (
								<PermissionAccess
									permission={calendarPermissions.booking.cancel({
										bookingId: booking.id,
										hostId: booking.hostId,
										tokenValid: false,
									})}
								>
									<Button
										className="min-h-11"
										variant="outline"
										disabled={cancel.isPending}
										onClick={() => cancel.mutate(booking.id)}
									>
										Cancel booking
										<span className="sr-only"> for {booking.name}</span>
									</Button>
								</PermissionAccess>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function WaitlistSection() {
	const { data: entries } = useCalendarWaitlist();
	return (
		<section aria-labelledby="calendar-waitlist-heading" className="space-y-4">
			<h2 id="calendar-waitlist-heading" className="text-xl font-semibold">
				Waitlist
			</h2>
			<p className="text-sm text-muted-foreground">
				Verified attendees receive offers in order. An offer holds a place until
				it is accepted, cancelled or expires.
			</p>
			{entries.length === 0 ? (
				<p className="rounded-lg border p-6 text-muted-foreground">
					No waitlist entries.
				</p>
			) : (
				<ul className="divide-y rounded-lg border">
					{entries.map((entry) => (
						<li key={entry.id} className="space-y-1 p-4 sm:p-5">
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<h3 className="break-words font-medium">{entry.eventName}</h3>
								<span className="text-sm">
									{entry.status === "unverified"
										? "Email verification pending"
										: entry.status === "offered"
											? "Offer sent"
											: entry.status === "waiting"
												? "Waiting"
												: entry.status === "accepted"
													? "Accepted"
													: entry.status === "cancelled"
														? "Cancelled"
														: "Expired"}
								</span>
							</div>
							<p>
								{formatCalendarTime(entry.start, entry.timezone)} (
								{entry.timezone})
							</p>
							<p className="break-words text-sm text-muted-foreground">
								{entry.name} · {entry.email}
							</p>
							{entry.offerExpiresAt && entry.status === "offered" && (
								<p className="text-sm">
									Offer expires{" "}
									{formatCalendarTime(entry.offerExpiresAt, entry.timezone)} (
									{entry.timezone})
								</p>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
