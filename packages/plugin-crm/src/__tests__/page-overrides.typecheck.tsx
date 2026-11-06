import type { CrmPluginOverrides } from "../client/overrides";

const valid: CrmPluginOverrides = {
	pageOverrides: { contactDetail: { ActivitySummary: () => null } },
};
const invalidPage: CrmPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Page names use the plugin's route keys.
		unknownPage: { ActivitySummary: () => null },
	},
};
const invalidSlot: CrmPluginOverrides = {
	pageOverrides: {
		contactDetail: {
			// @ts-expect-error Only the page's documented presentation slots are accepted.
			UnknownSlot: () => null,
		},
	},
};
const invalidProps: CrmPluginOverrides = {
	pageOverrides: {
		contactDetail: {
			// @ts-expect-error Slot components receive the plugin's typed presentation props.
			ActivitySummary: (_: { missing: string }) => null,
		},
	},
};
void [valid, invalidPage, invalidSlot, invalidProps];
