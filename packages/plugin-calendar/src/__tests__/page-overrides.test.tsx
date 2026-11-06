import { CalendarBookingPage } from "../client/components/pages/booking";
import { CalendarReschedulePage } from "../client/components/pages/reschedule";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { calendarClientPlugin } from "../client/plugin";
import type { CalendarPluginOverrides } from "../client/overrides";
import { CalendarTimePicker } from "../client/components/time-picker";
import type { CalendarTimePickerProps } from "../client/components/time-picker";

vi.mock("../client/hooks", () => ({
	usePublicCalendarEvent: () => ({
		data: {
			id: "event",
			name: "Consultation",
			timezone: "UTC",
			capacity: 1,
			duration: 30,
			price: 0,
		},
	}),
	useCalendarSlots: () => props.slots,
	useCreateCalendarBooking: () => ({ isPending: false }),
	useCalendarBooking: () => ({
		data: {
			id: "booking",
			eventName: "Consultation",
			timezone: "UTC",
			start: "2099-11-06T12:00:00Z",
			status: "confirmed",
		},
	}),
	useCalendarRescheduleSlots: () => props.slots,
	useRescheduleCalendarBooking: () => ({ isPending: false }),
}));

const props: ComponentProps<typeof CalendarTimePicker> = {
	date: "2026-11-06",
	timezone: "UTC",
	start: "",
	onDate: vi.fn(),
	onTimezone: vi.fn(),
	onStart: vi.fn(),
	slots: {
		data: { slots: [] },
		isPending: false,
		isFetching: false,
		error: null,
		refetch: vi.fn(),
	} as unknown as CalendarTimePickerProps["slots"],
};
const pages = ["calendarBooking", "calendarReschedule"] as const;
type SlotProps = ComponentProps<
	NonNullable<
		NonNullable<
			NonNullable<
				CalendarPluginOverrides["pageOverrides"]
			>[(typeof pages)[number]]
		>["TimePicker"]
	>
>;
const custom = (name: string) => (props: SlotProps) => (
	<output data-slot-override={name}>{props.timezone}</output>
);

function render(page: ReactElement, overrides: CalendarPluginOverrides = {}) {
	const stack = createClientStack({
		api: { baseURL: "https://test.local", basePath: "/api/data" },
		site: { baseURL: "https://test.local", basePath: "/pages" },
		queryClient: new QueryClient(),
		plugins: { calendar: calendarClientPlugin() },
	});
	return renderToStaticMarkup(
		<StackProvider stack={stack} overrides={{ calendar: overrides }}>
			{page}
		</StackProvider>,
	);
}

describe("calendar page presentation overrides", () => {
	it("selects each explicitly scoped page's component", () => {
		const overrides = {
			pageOverrides: Object.fromEntries(
				pages.map((page) => [page, { TimePicker: custom(page) }]),
			),
		};
		for (const page of pages) {
			const html = render(
				<CalendarTimePicker {...props} page={page} />,
				overrides,
			);
			expect(html).toContain(`data-slot-override="${page}"`);
			for (const other of pages.filter((key) => key !== page))
				expect(html).not.toContain(`data-slot-override="${other}"`);
		}
	});

	it("isolates one page and preserves built-ins for unconfigured scopes", () => {
		const overrides = {
			pageOverrides: { [pages[0]]: { TimePicker: custom("specific") } },
		};
		expect(
			render(<CalendarTimePicker {...props} page={pages[0]} />, overrides),
		).toContain('data-slot-override="specific"');
		for (const page of pages.slice(1)) {
			const html = render(
				<CalendarTimePicker {...props} page={page} />,
				overrides,
			);
			expect(html).toContain("Choose a time");
			expect(html).not.toContain("data-slot-override");
		}
		const standalone = render(<CalendarTimePicker {...props} />, overrides);
		expect(standalone).toContain("Choose a time");
		expect(standalone).not.toContain("data-slot-override");
	});

	it("preserves unchanged defaults and empty page configuration", () => {
		for (const page of pages) {
			const html = render(<CalendarTimePicker {...props} page={page} />);
			expect(html).toContain("Choose a time");
			expect(
				render(<CalendarTimePicker {...props} page={page} />, {
					pageOverrides: { [page]: {} },
				}),
			).toBe(html);
		}
	});
});

it("built-in pages supply their own route scope", () => {
	const builtInPages = [
		<CalendarBookingPage slug="consultation" />,
		<CalendarReschedulePage token="token" />,
	];
	const scopes = pages;
	const overrides = {
		pageOverrides: Object.fromEntries(
			scopes.map((page) => [page, { TimePicker: custom(page) }]),
		),
	};
	for (const [index, page] of builtInPages.entries()) {
		expect(render(page, overrides)).toContain(
			`data-slot-override="${scopes[index]}"`,
		);
	}
});

it("preserves standalone rendering without StackProvider", () => {
	expect(renderToStaticMarkup(<CalendarTimePicker {...props} />)).toContain(
		"Choose a time",
	);
});
