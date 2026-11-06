import type { CMSPluginOverrides } from "../client";

const validPageOverrides: NonNullable<CMSPluginOverrides["pageOverrides"]> = {
	dashboard: {
		EmptyState: (props) => {
			props.title;
			return null;
		},
	},
	contentList: {
		EmptyState: (props) => {
			props.title;
			return null;
		},
	},
	newContent: {
		EmptyState: (props) => {
			props.title;
			return null;
		},
	},
	editContent: {
		EmptyState: (props) => {
			props.title;
			return null;
		},
	},
};
void validPageOverrides;

const invalidPage: NonNullable<CMSPluginOverrides["pageOverrides"]> = {
	// @ts-expect-error Only built-in route keys are supported.
	unknownPage: {},
};
void invalidPage;

const invalidSlot: NonNullable<CMSPluginOverrides["pageOverrides"]> = {
	dashboard: {
		// @ts-expect-error Slot names follow the page's native composition.
		UnknownComponent: () => null,
	},
};
void invalidSlot;

const invalidProps: NonNullable<CMSPluginOverrides["pageOverrides"]> = {
	dashboard: {
		// @ts-expect-error Components receive native presentation props, not arbitrary route parameters.
		EmptyState: (_props: { unrelated: string }) => null,
	},
};
void invalidProps;

const validCard: NonNullable<CMSPluginOverrides["pageOverrides"]> = {
	dashboard: {
		ContentTypeCard: ({ contentType, itemCountLabel, onOpen }) => {
			contentType.slug;
			itemCountLabel.toUpperCase();
			onOpen();
			return null;
		},
	},
};
void validCard;
const invalidCard: NonNullable<CMSPluginOverrides["pageOverrides"]> = {
	dashboard: {
		// @ts-expect-error Dashboard cards receive serialized content types.
		ContentTypeCard: (_props: { slug: string }) => null,
	},
};
void invalidCard;
const isolatedCard: NonNullable<CMSPluginOverrides["pageOverrides"]> = {
	contentList: {
		// @ts-expect-error Content type cards belong only to the dashboard.
		ContentTypeCard: () => null,
	},
};
void isolatedCard;
