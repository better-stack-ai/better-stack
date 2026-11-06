import type { UIBuilderPluginOverrides } from "../client/overrides";

const valid: UIBuilderPluginOverrides = {
	pageOverrides: { pageList: { EmptyState: () => null } },
};
const invalidPage: UIBuilderPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Page names use the plugin's route keys.
		unknownPage: { EmptyState: () => null },
	},
};
const invalidSlot: UIBuilderPluginOverrides = {
	pageOverrides: {
		pageList: {
			// @ts-expect-error Only the page's documented presentation slots are accepted.
			UnknownSlot: () => null,
		},
	},
};
const invalidProps: UIBuilderPluginOverrides = {
	pageOverrides: {
		pageList: {
			// @ts-expect-error Slot components receive the plugin's typed presentation props.
			EmptyState: (_: { missing: string }) => null,
		},
	},
};
void [valid, invalidPage, invalidSlot, invalidProps];
