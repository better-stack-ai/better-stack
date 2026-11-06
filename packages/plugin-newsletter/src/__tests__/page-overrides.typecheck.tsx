import type { NewsletterPluginOverrides } from "../client/overrides";

const valid: NewsletterPluginOverrides = {
	pageOverrides: { subscribers: { Header: () => null } },
};
const invalidPage: NewsletterPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Page names use the plugin's route keys.
		unknownPage: { Header: () => null },
	},
};
const invalidSlot: NewsletterPluginOverrides = {
	pageOverrides: {
		subscribers: {
			// @ts-expect-error Only the page's documented presentation slots are accepted.
			UnknownSlot: () => null,
		},
	},
};
const invalidProps: NewsletterPluginOverrides = {
	pageOverrides: {
		subscribers: {
			// @ts-expect-error Slot components receive the plugin's typed presentation props.
			Header: (_: { missing: string }) => null,
		},
	},
};
void [valid, invalidPage, invalidSlot, invalidProps];
