import type { AffiliatePluginOverrides } from "../client/overrides";

const valid: AffiliatePluginOverrides = {
	pageOverrides: { affiliateDetail: { Stats: () => null } },
};
const invalidPage: AffiliatePluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Page names use the plugin's route keys.
		unknownPage: { Stats: () => null },
	},
};
const invalidSlot: AffiliatePluginOverrides = {
	pageOverrides: {
		affiliateDetail: {
			// @ts-expect-error Only the page's documented presentation slots are accepted.
			UnknownSlot: () => null,
		},
	},
};
const invalidProps: AffiliatePluginOverrides = {
	pageOverrides: {
		affiliateDetail: {
			// @ts-expect-error Slot components receive the plugin's typed presentation props.
			Stats: (_: { missing: string }) => null,
		},
	},
};
void [valid, invalidPage, invalidSlot, invalidProps];
