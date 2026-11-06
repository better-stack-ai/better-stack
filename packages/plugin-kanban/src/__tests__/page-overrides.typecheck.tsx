import type { KanbanPluginOverrides } from "../client";

const validPageOverrides: NonNullable<KanbanPluginOverrides["pageOverrides"]> =
	{
		board: {
			TaskDetails: (props) => {
				props.task;
				return null;
			},
		},
	};
void validPageOverrides;

const invalidPage: NonNullable<KanbanPluginOverrides["pageOverrides"]> = {
	// @ts-expect-error Only built-in route keys are supported.
	unknownPage: {},
};
void invalidPage;

const invalidSlot: NonNullable<KanbanPluginOverrides["pageOverrides"]> = {
	board: {
		// @ts-expect-error Slot names follow the page's native composition.
		UnknownComponent: () => null,
	},
};
void invalidSlot;

const invalidProps: NonNullable<KanbanPluginOverrides["pageOverrides"]> = {
	board: {
		// @ts-expect-error Components receive native presentation props, not arbitrary route parameters.
		TaskDetails: (_props: { unrelated: string }) => null,
	},
};
void invalidProps;
