import type { EcommercePluginOverrides } from "../client/overrides";

const valid: EcommercePluginOverrides = {
	pageOverrides: { shop: { ProductCard: () => null } },
};
const invalidPage: EcommercePluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Page names use the plugin's route keys.
		unknownPage: { ProductCard: () => null },
	},
};
const invalidSlot: EcommercePluginOverrides = {
	pageOverrides: {
		shop: {
			// @ts-expect-error Only the page's documented presentation slots are accepted.
			UnknownSlot: () => null,
		},
	},
};
const invalidProps: EcommercePluginOverrides = {
	pageOverrides: {
		shop: {
			// @ts-expect-error Slot components receive the plugin's typed presentation props.
			ProductCard: (_: { missing: string }) => null,
		},
	},
};
void [valid, invalidPage, invalidSlot, invalidProps];
