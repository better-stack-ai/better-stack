// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CalendarBookingPage } from "../client/components/pages/booking";
import { CalendarPayment } from "../client/components/payment";
import type { BookingCheckout } from "../types";

const state = vi.hoisted(() => ({
	mutateAsync: vi.fn(),
	openCheckout: vi.fn(),
	createBooking: vi.fn(),
	eventId: "event-current",
	navigate: vi.fn(),
	checkout: {
		id: "booking-current",
		cancelToken: "token-current",
		checkout: { clientSecret: "current-booking-secret" },
	} as
		| { id: string; cancelToken: string; checkout: { clientSecret: string } }
		| undefined,
}));
vi.mock("@btst/stack/context", () => ({
	usePluginSiteNavigation: () => ({
		Link: "a",
		navigate: state.navigate,
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
	usePluginOverrides: () => ({
		renderPayment: (checkout: { clientSecret?: string }) =>
			`Payment form: ${checkout.clientSecret}`,
	}),
}));
vi.mock("../client/hooks", () => ({
	usePublicCalendarEvent: () => ({
		data: {
			id: state.eventId,
			timezone: "UTC",
			name: "Paid consultation",
			duration: 30,
			capacity: 1,
			price: 2000,
			currency: "USD",
		},
	}),
	useCalendarSlots: () => ({
		data: {
			slots: [
				{
					start: "2030-01-07T09:00:00Z",
					end: "2030-01-07T09:30:00Z",
					remaining: 1,
				},
			],
		},
		isFetching: false,
	}),
	useCreateCalendarBooking: () => ({ mutateAsync: state.createBooking }),
	useCalendarBookingCheckout: () => ({
		data: state.checkout,
		mutateAsync: state.mutateAsync,
	}),
}));

vi.mock("../client/components/checkout", async (importOriginal) => ({
	...(await importOriginal<typeof import("../client/components/checkout")>()),
	openCalendarCheckout: (...args: unknown[]) => state.openCheckout(...args),
}));
vi.mock("../client/components/invite-download", () => ({
	CalendarInviteDownload: () => null,
}));
vi.mock("../client/components/shared", () => ({
	CalendarPage: ({ children }: { children: ReactNode }) => children,
	Field: ({ children, label }: { children: ReactNode; label: string }) =>
		createElement("label", null, label, children),
	formatCalendarTime: () => "9:00 AM UTC",
	formatCalendarPrice: () => "$20.00",
}));
vi.mock("../client/components/time-picker", () => ({
	CalendarTimePicker: ({ onStart }: { onStart: (start: string) => void }) =>
		createElement(
			"button",
			{ type: "button", onClick: () => onStart("2030-01-07T09:00:00Z") },
			"Choose test slot",
		),
	calendarToday: () => "2030-01-07",
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
		state.mutateAsync.mockReset();
		state.createBooking.mockReset();
		state.navigate.mockReset();
		state.eventId = "event-current";
		state.openCheckout.mockReset();
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
		state.checkout!.id = "booking-previous";
		state.checkout!.checkout.clientSecret = "previous-booking-secret";
		const html = render();
		expect(html).not.toContain("previous-booking-secret");
		expect(html).toContain("Continue payment");
	});
	it("requires the current private token even when booking IDs match", () => {
		state.checkout!.cancelToken = "token-previous";
		state.checkout!.checkout.clientSecret = "previous-token-secret";
		const html = render();
		expect(html).not.toContain("previous-token-secret");
		expect(html).toContain("Continue payment");
	});

	describe("deferred hosted checkout", () => {
		let container: HTMLDivElement;
		let root: Root | null;
		const response = {
			...booking,
			checkout: {
				redirectUrl: "https://payments.example.test/booking-current",
			},
		};
		beforeEach(async () => {
			(
				globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
			).IS_REACT_ACT_ENVIRONMENT = true;
			state.checkout = undefined;
			container = document.createElement("div");
			document.body.append(container);
			root = createRoot(container);
			await act(async () =>
				root!.render(createElement(CalendarPayment, { booking })),
			);
		});
		afterEach(async () => {
			if (root) await act(async () => root!.unmount());
			container.remove();
		});
		async function beginCheckout() {
			let release!: (value: typeof response) => void;
			const pending = new Promise<typeof response>((resolve) => {
				release = resolve;
			});
			state.mutateAsync.mockReturnValue(pending);
			const button = [...container.querySelectorAll("button")].find(
				(element) => element.textContent === "Continue payment",
			);
			expect(button).toBeDefined();
			await act(async () => button!.click());
			expect(state.mutateAsync).toHaveBeenCalledWith(booking.cancelToken);
			return async () => {
				await act(async () => {
					release(response);
					await pending;
				});
			};
		}
		it("opens a matching response while its original booking is still mounted", async () => {
			const finish = await beginCheckout();
			await finish();
			expect(state.openCheckout).toHaveBeenCalledExactlyOnceWith(
				response,
				response.checkout.redirectUrl,
			);
		});
		it.each(["booking change", "token change", "unmount"])(
			"ignores a late checkout response after %s",
			async (change) => {
				const finish = await beginCheckout();
				if (change === "unmount") {
					await act(async () => root!.unmount());
					root = null;
				} else {
					const next =
						change === "token change"
							? { ...booking, cancelToken: "token-next" }
							: { ...booking, id: "booking-next", cancelToken: "token-next" };
					await act(async () =>
						root!.render(createElement(CalendarPayment, { booking: next })),
					);
				}
				await finish();
				expect(state.openCheckout).not.toHaveBeenCalled();
			},
		);
	});

	describe("deferred initial reservation", () => {
		let container: HTMLDivElement;
		let root: Root | null;
		const response = {
			...booking,
			checkout: {
				redirectUrl: "https://payments.example.test/booking-current",
			},
		};
		beforeEach(async () => {
			(
				globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
			).IS_REACT_ACT_ENVIRONMENT = true;
			state.checkout = undefined;
			container = document.createElement("div");
			document.body.append(container);
			root = createRoot(container);
			await act(async () =>
				root!.render(
					createElement(CalendarBookingPage, { slug: "consultation" }),
				),
			);
			await act(async () =>
				container.querySelector<HTMLButtonElement>("button")!.click(),
			);
		});
		afterEach(async () => {
			if (root) await act(async () => root!.unmount());
			container.remove();
		});
		async function beginReservation() {
			let release!: (value: typeof response) => void;
			const pending = new Promise<typeof response>((resolve) => {
				release = resolve;
			});
			state.createBooking.mockReturnValue(pending);
			const form = container.querySelector("form");
			expect(form).not.toBeNull();
			await act(async () => {
				form!.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				);
			});
			expect(state.createBooking).toHaveBeenCalledOnce();
			return async () => {
				await act(async () => {
					release(response);
					await pending;
				});
			};
		}
		it("opens the reservation checkout for the current event page", async () => {
			const finish = await beginReservation();
			await finish();
			expect(state.openCheckout).toHaveBeenCalledExactlyOnceWith(
				response,
				response.checkout.redirectUrl,
			);
		});
		it.each(["event change", "unmount"])(
			"ignores a late reservation response after %s",
			async (change) => {
				const finish = await beginReservation();
				if (change === "unmount") {
					await act(async () => root!.unmount());
					root = null;
				} else {
					state.eventId = "event-next";
					await act(async () =>
						root!.render(
							createElement(CalendarBookingPage, { slug: "next-consultation" }),
						),
					);
				}
				await finish();
				expect(state.openCheckout).not.toHaveBeenCalled();
				expect(container.textContent).not.toContain("Booking awaiting payment");
			},
		);
	});
});
