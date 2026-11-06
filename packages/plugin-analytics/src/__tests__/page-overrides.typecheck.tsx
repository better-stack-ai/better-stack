import type { AnalyticsPluginOverrides } from "../client";

const valid: AnalyticsPluginOverrides = {
	pageOverrides: {
		analyticsDashboard: {
			TrafficChart: (props) => <span>{props.series[0]?.pageViews}</span>,
		},
	},
};
void valid;
const invalidPage: AnalyticsPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Only audited built-in page keys are supported.
		unknownPage: {},
	},
};
const invalidSlot: AnalyticsPluginOverrides = {
	pageOverrides: {
		analyticsDashboard: {
			// @ts-expect-error Slots are specific to this page composition.
			UnknownComponent: () => null,
		},
	},
};
const invalidProps: AnalyticsPluginOverrides = {
	pageOverrides: {
		analyticsDashboard: {
			// @ts-expect-error Replacement components must accept the built-in props.
			TrafficChart: (_props: { impossible: string }) => null,
		},
	},
};
void invalidPage;
void invalidSlot;
void invalidProps;
