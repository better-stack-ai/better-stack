import type { CommentsPluginOverrides } from "../client";

const validPageOverrides: NonNullable<
	CommentsPluginOverrides["pageOverrides"]
> = {
	moderation: {
		Pagination: (props) => {
			props.total;
			return null;
		},
	},
	userComments: {
		Pagination: (props) => {
			props.total;
			return null;
		},
	},
};
void validPageOverrides;

const invalidPage: NonNullable<CommentsPluginOverrides["pageOverrides"]> = {
	// @ts-expect-error Only built-in route keys are supported.
	unknownPage: {},
};
void invalidPage;

const invalidSlot: NonNullable<CommentsPluginOverrides["pageOverrides"]> = {
	moderation: {
		// @ts-expect-error Slot names follow the page's native composition.
		UnknownComponent: () => null,
	},
};
void invalidSlot;

const invalidProps: NonNullable<CommentsPluginOverrides["pageOverrides"]> = {
	moderation: {
		// @ts-expect-error Components receive native presentation props, not arbitrary route parameters.
		Pagination: (_props: { unrelated: string }) => null,
	},
};
void invalidProps;
