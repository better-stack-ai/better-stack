import type { FormBuilderPluginOverrides } from "../client";

const validPageOverrides: NonNullable<
	FormBuilderPluginOverrides["pageOverrides"]
> = {
	formList: {
		Pagination: (props) => {
			props.total;
			return null;
		},
	},
	submissions: {
		Pagination: (props) => {
			props.total;
			return null;
		},
	},
};
void validPageOverrides;

const invalidPage: NonNullable<FormBuilderPluginOverrides["pageOverrides"]> = {
	// @ts-expect-error Only built-in route keys are supported.
	unknownPage: {},
};
void invalidPage;

const invalidSlot: NonNullable<FormBuilderPluginOverrides["pageOverrides"]> = {
	formList: {
		// @ts-expect-error Slot names follow the page's native composition.
		UnknownComponent: () => null,
	},
};
void invalidSlot;

const invalidProps: NonNullable<FormBuilderPluginOverrides["pageOverrides"]> = {
	formList: {
		// @ts-expect-error Components receive native presentation props, not arbitrary route parameters.
		Pagination: (_props: { unrelated: string }) => null,
	},
};
void invalidProps;
