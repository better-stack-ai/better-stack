import type { MediaPluginOverrides } from "../client";

const validPageOverrides: NonNullable<MediaPluginOverrides["pageOverrides"]> = {
	library: {
		AssetThumbnail: (props) => {
			props.asset;
			return null;
		},
	},
};
void validPageOverrides;

const invalidPage: NonNullable<MediaPluginOverrides["pageOverrides"]> = {
	// @ts-expect-error Only built-in route keys are supported.
	unknownPage: {},
};
void invalidPage;

const invalidSlot: NonNullable<MediaPluginOverrides["pageOverrides"]> = {
	library: {
		// @ts-expect-error Slot names follow the page's native composition.
		UnknownComponent: () => null,
	},
};
void invalidSlot;

const invalidProps: NonNullable<MediaPluginOverrides["pageOverrides"]> = {
	library: {
		// @ts-expect-error Components receive native presentation props, not arbitrary route parameters.
		AssetThumbnail: (_props: { unrelated: string }) => null,
	},
};
void invalidProps;
