import type { CalendarPluginOverrides } from "../client";

const valid: CalendarPluginOverrides = {
	pageOverrides: {
		calendarBooking: { TimePicker: (props) => <span>{props.timezone}</span> },
		calendarReschedule: {
			TimePicker: (props) => <span>{props.timezone}</span>,
		},
	},
};
void valid;
const invalidPage: CalendarPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Only audited built-in page keys are supported.
		unknownPage: {},
	},
};
const invalidSlot: CalendarPluginOverrides = {
	pageOverrides: {
		calendarBooking: {
			// @ts-expect-error Slots are specific to this page composition.
			UnknownComponent: () => null,
		},
	},
};
const invalidProps: CalendarPluginOverrides = {
	pageOverrides: {
		calendarBooking: {
			// @ts-expect-error Replacement components must accept the built-in props.
			TimePicker: (_props: { impossible: string }) => null,
		},
	},
};
void invalidPage;
void invalidSlot;
void invalidProps;
