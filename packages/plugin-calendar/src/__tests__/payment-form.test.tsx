import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarPayment } from "../client/components/payment";
import type { BookingCheckout } from "../types";

const state = vi.hoisted(() => ({
	checkout: {
		id: "booking-current",
		cancelToken: "token-current",
		checkout: { clientSecret: "current-booking-secret" },
	},
}));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => ({
		renderPayment: (checkout: { clientSecret?: string }) =>
			`Payment form: ${checkout.clientSecret}`,
	}),
}));
vi.mock("../client/hooks", () => ({
	useCalendarBookingCheckout: () => ({ data: state.checkout }),
}));

const booking: BookingCheckout = {
	id: "booking-current",
	eventTypeId: "event-current",
	hostId: "host-current",
	eventName: "Paid consultation",
	start: "2030-01-07T09:00:00Z",
	end: "2030-01-07T09:30:00Z",
	timezone: "UTC",
	name: "Current attendee",
	email: "current@example.com",
	status: "pending_payment",
	cancelToken: "token-current",
	createdAt: "2030-01-01T00:00:00Z",
	hasCheckout: true,
};

describe("Calendar payment form ownership", () => {
	beforeEach(() => {
		state.checkout = {
			id: "booking-current",
			cancelToken: "token-current",
			checkout: { clientSecret: "current-booking-secret" },
		};
	});
	const render = () =>
		renderToStaticMarkup(createElement(CalendarPayment, { booking }));

	it("renders checkout for the current booking and private token", () => {
		expect(render()).toContain("Payment form: current-booking-secret");
	});
	it("hides retained credentials from a different booking", () => {
		state.checkout.id = "booking-previous";
		state.checkout.checkout.clientSecret = "previous-booking-secret";
		const html = render();
		expect(html).not.toContain("previous-booking-secret");
		expect(html).toContain("Continue payment");
	});
	it("requires the current private token even when booking IDs match", () => {
		state.checkout.cancelToken = "token-previous";
		state.checkout.checkout.clientSecret = "previous-token-secret";
		const html = render();
		expect(html).not.toContain("previous-token-secret");
		expect(html).toContain("Continue payment");
	});
});
