import type { FeatureFlagsPluginOverrides } from "../client";

const valid: FeatureFlagsPluginOverrides = {
	pageOverrides: {
		flags: { Rollout: (props) => <span>{props.percent}</span> },
		newFlag: { Rollout: (props) => <span>{props.percent}</span> },
		editFlag: { Rollout: (props) => <span>{props.percent}</span> },
	},
};
void valid;
const invalidPage: FeatureFlagsPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Only audited built-in page keys are supported.
		unknownPage: {},
	},
};
const invalidSlot: FeatureFlagsPluginOverrides = {
	pageOverrides: {
		flags: {
			// @ts-expect-error Slots are specific to this page composition.
			UnknownComponent: () => null,
		},
	},
};
const invalidProps: FeatureFlagsPluginOverrides = {
	pageOverrides: {
		flags: {
			// @ts-expect-error Replacement components must accept the built-in props.
			Rollout: (_props: { impossible: string }) => null,
		},
	},
};
void invalidPage;
void invalidSlot;
void invalidProps;
