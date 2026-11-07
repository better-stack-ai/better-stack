// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarWaitlistPage } from "../client/components/pages/waitlist";
import {
	CalendarTimePicker,
	type CalendarTimePickerProps,
} from "../client/components/time-picker";

const state = vi.hoisted(() => ({
	verify: vi.fn(),
	cancel: vi.fn(),
	accept: vi.fn(),
	refetch: vi.fn(),
	entry: {
		id: "entry",
		eventTypeId: "event",
		eventName: "Group workshop",
		start: "2099-01-07T09:00:00Z",
		timezone: "UTC",
		status: "unverified",
		expiresAt: "2099-01-07T09:00:00Z",
		offerExpiresAt: null as string | null,
	},
}));
vi.mock("@btst/stack/context", () => ({
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
}));
vi.mock("../client/hooks", () => ({
	useCalendarWaitlistEntry: () => ({
		data: state.entry,
		refetch: state.refetch,
	}),
	useVerifyCalendarWaitlist: () => ({ mutate: state.verify }),
	useCancelCalendarWaitlist: () => ({ mutate: state.cancel }),
	useAcceptCalendarWaitlistOffer: () => ({ mutateAsync: state.accept }),
}));
vi.mock("../client/components/shared", () => ({
	calendarSelectClass: "",
	CalendarPage: ({ children }: { children: ReactNode }) => children,
	Field: ({ children, label }: { children: ReactNode; label: string }) =>
		createElement("label", null, label, children),
	formatCalendarTime: (value: string) => value,
}));
vi.mock("../client/components/payment", () => ({
	CalendarPayment: () => createElement("div", { "data-testid": "payment" }),
}));
vi.mock("../client/components/invite-download", () => ({
	CalendarInviteDownload: () =>
		createElement("div", { "data-testid": "invite" }),
}));

describe("waitlist presentation and private actions", () => {
	let container: HTMLDivElement;
	let root: Root;
	beforeEach(() => {
		(
			globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
		).IS_REACT_ACT_ENVIRONMENT = true;
		vi.clearAllMocks();
		state.entry.status = "unverified";
		state.entry.offerExpiresAt = null;
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
	});
	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
	});
	async function render(token = "private-token") {
		await act(async () =>
			root.render(createElement(CalendarWaitlistPage, { token })),
		);
	}
	function button(label: string) {
		const result = [...container.querySelectorAll("button")].find(
			(node) => node.textContent === label,
		);
		expect(result).toBeDefined();
		return result!;
	}
	it("requires explicit verification and sends only the private management token", async () => {
		await render();
		expect(state.verify).not.toHaveBeenCalled();
		await act(async () => button("Verify email and join waitlist").click());
		expect(state.verify).toHaveBeenCalledExactlyOnceWith("private-token");
		await act(async () => button("Leave waitlist").click());
		expect(state.cancel).toHaveBeenCalledExactlyOnceWith("private-token");
	});
	it("requires accepting a live offer and offers a status refresh", async () => {
		state.entry.status = "offered";
		state.entry.offerExpiresAt = "2099-01-07T08:00:00Z";
		state.accept.mockResolvedValue({
			id: "booking",
			status: "pending_payment",
			cancelToken: "booking-secret",
		});
		await render();
		expect(state.accept).not.toHaveBeenCalled();
		await act(async () => button("Check waitlist status").click());
		expect(state.refetch).toHaveBeenCalledOnce();
		await act(async () => button("Accept offer").click());
		expect(state.accept).toHaveBeenCalledExactlyOnceWith("private-token");
		expect(container.textContent).toContain("Booking awaiting payment");
		expect(container.querySelector("a")?.getAttribute("href")).toContain(
			"booking-secret",
		);
		await render("different-private-token");
		expect(container.textContent).not.toContain("Booking awaiting payment");
		expect(container.innerHTML).not.toContain("booking-secret");
	});
	it("recovers an already accepted booking through the private waitlist token", async () => {
		state.entry.status = "accepted";
		state.accept.mockResolvedValue({
			id: "booking",
			status: "pending_payment",
			cancelToken: "booking-secret",
		});
		await render();
		await act(async () => button("View booking").click());
		expect(state.accept).toHaveBeenCalledExactlyOnceWith("private-token");
		expect(container.textContent).toContain("Booking awaiting payment");
		expect(container.querySelector("a")?.getAttribute("href")).toContain(
			"booking-secret",
		);
	});
	it("shows cancelled status and omits payment and invite when recovering a cancelled booking", async () => {
		state.entry.status = "accepted";
		state.accept.mockResolvedValue({
			id: "booking",
			status: "cancelled",
			cancelToken: "booking-secret",
		});
		await render();
		await act(async () => button("View booking").click());
		expect(container.querySelector("h1")?.textContent).toBe(
			"Booking cancelled",
		);
		expect(container.querySelector('[data-testid="payment"]')).toBeNull();
		expect(container.querySelector('[data-testid="invite"]')).toBeNull();
		expect(container.querySelector("a")?.getAttribute("href")).toContain(
			"booking-secret",
		);
	});
	it("does not offer acceptance for an expired offer", async () => {
		state.entry.status = "offered";
		state.entry.offerExpiresAt = "2000-01-01T00:00:00Z";
		await render();
		expect(container.textContent).toContain("This offer has expired");
		expect(container.textContent).not.toContain("Accept offer");
	});
	it("ignores acceptance credentials returned after navigation to another private entry", async () => {
		state.entry.status = "offered";
		state.entry.offerExpiresAt = "2099-01-07T08:00:00Z";
		let complete!: (booking: unknown) => void;
		state.accept.mockReturnValue(
			new Promise((resolve) => {
				complete = resolve;
			}),
		);
		await render();
		await act(async () => button("Accept offer").click());
		await render("different-private-token");
		await act(async () =>
			complete({
				id: "previous-booking",
				status: "confirmed",
				cancelToken: "previous-booking-secret",
			}),
		);
		expect(container.innerHTML).not.toContain("previous-booking-secret");
		expect(container.textContent).not.toContain("Booking confirmed");
	});
});

it("shows full slots only when waitlist selection is enabled", () => {
	const props: CalendarTimePickerProps = {
		date: "2099-01-07",
		timezone: "UTC",
		start: "",
		capacity: 2,
		onDate: vi.fn(),
		onTimezone: vi.fn(),
		onStart: vi.fn(),
		slots: {
			data: {
				slots: [],
				waitlistSlots: [
					{
						start: "2099-01-07T09:00:00Z",
						end: "2099-01-07T09:30:00Z",
						remaining: 0,
					},
				],
			},
		} as unknown as CalendarTimePickerProps["slots"],
	};
	expect(
		renderToStaticMarkup(createElement(CalendarTimePicker, props)),
	).not.toContain("Join waitlist");
	const html = renderToStaticMarkup(
		createElement(CalendarTimePicker, { ...props, waitlistEnabled: true }),
	);
	expect(html).toContain('data-testid="calendar-waitlist-slot"');
	expect(html).toContain("Full · Join waitlist");
});
