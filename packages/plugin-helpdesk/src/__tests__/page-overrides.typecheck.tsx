import type { HelpdeskPluginOverrides } from "../client";

const valid: HelpdeskPluginOverrides = {
	pageOverrides: {
		helpdeskTicket: {
			Conversation: (props) => <span>{props.messages[0]?.body}</span>,
		},
		helpdeskInboxTicket: {
			Conversation: (props) => <span>{props.messages[0]?.body}</span>,
		},
	},
};
void valid;
const invalidPage: HelpdeskPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Only audited built-in page keys are supported.
		unknownPage: {},
	},
};
const invalidSlot: HelpdeskPluginOverrides = {
	pageOverrides: {
		helpdeskTicket: {
			// @ts-expect-error Slots are specific to this page composition.
			UnknownComponent: () => null,
		},
	},
};
const invalidProps: HelpdeskPluginOverrides = {
	pageOverrides: {
		helpdeskTicket: {
			// @ts-expect-error Replacement components must accept the built-in props.
			Conversation: (_props: { impossible: string }) => null,
		},
	},
};
void invalidPage;
void invalidSlot;
void invalidProps;
