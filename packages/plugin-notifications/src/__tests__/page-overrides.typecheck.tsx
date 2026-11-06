import type { NotificationsPluginOverrides } from "../client";

const valid: NotificationsPluginOverrides = {
	pageOverrides: {
		inbox: { NotificationRow: (props) => <span>{props.item.title}</span> },
	},
};
void valid;
const invalidPage: NotificationsPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Only audited built-in page keys are supported.
		unknownPage: {},
	},
};
const invalidSlot: NotificationsPluginOverrides = {
	pageOverrides: {
		inbox: {
			// @ts-expect-error Slots are specific to this page composition.
			UnknownComponent: () => null,
		},
	},
};
const invalidProps: NotificationsPluginOverrides = {
	pageOverrides: {
		inbox: {
			// @ts-expect-error Replacement components must accept the built-in props.
			NotificationRow: (_props: { impossible: string }) => null,
		},
	},
};
void invalidPage;
void invalidSlot;
void invalidProps;
