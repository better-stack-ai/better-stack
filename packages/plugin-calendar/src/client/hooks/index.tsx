"use client";

import { useIdentity, useIdentitySourceGeneration } from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import { calendarResources } from "../../query-keys";
import { CALENDAR_PLUGIN_ID } from "../constants";

const calendar = createResource({
	plugin: CALENDAR_PLUGIN_ID,
	resources: calendarResources,
});

function useCalendarIdentity() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	if (isPending) return `pending:${generation}` as const;
	if (error) return `error:${generation}` as const;
	return identity ?? undefined;
}

export function useCalendarEvents() {
	return calendar.calendarEvents.list.useSuspense([useCalendarIdentity()]);
}

export function useCalendarEvent(id: string) {
	return calendar.calendarEvents.detail.useSuspense([
		id,
		useCalendarIdentity(),
	]);
}

export function useCalendarBookings(period: "upcoming" | "past" | "all") {
	return calendar.calendarBookings.list.useSuspense([
		period,
		useCalendarIdentity(),
	]);
}

export const usePublicCalendarEvent = (slug: string) =>
	calendar.calendarPublicEvents.detail.useSuspense([slug]);
export const useCalendarSlots = (
	slug: string,
	date: string,
	timezone: string,
) => calendar.calendarSlots.list.use([slug, date, timezone]);
export const useCalendarBooking = (token: string) =>
	calendar.calendarBookings.detail.useSuspense([token]);
export const useCreateCalendarEvent = () =>
	calendar.calendarEvents.create.use();
export const useUpdateCalendarEvent = () =>
	calendar.calendarEvents.update.use();
export const useDeleteCalendarEvent = () =>
	calendar.calendarEvents.delete.use();
export const useCreateCalendarBooking = () =>
	calendar.calendarBookings.create.use();
export const useCancelCalendarBooking = () =>
	calendar.calendarBookings.cancel.use();
export const useCancelHostCalendarBooking = () =>
	calendar.calendarBookings.cancelHost.use();
export const useRescheduleCalendarBooking = () =>
	calendar.calendarBookings.reschedule.use();
export const useCalendarRescheduleSlots = (
	token: string,
	date: string,
	timezone: string,
) => calendar.calendarRescheduleSlots.list.use([token, date, timezone]);
export { generateBookingInvite } from "../../ical";

export const useCalendarBookingCheckout = () =>
	calendar.calendarBookings.checkout.use();
