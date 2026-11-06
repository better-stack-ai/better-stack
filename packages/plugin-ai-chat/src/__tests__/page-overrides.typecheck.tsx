import type { AiChatPluginOverrides } from "../client";

const validPageOverrides: NonNullable<AiChatPluginOverrides["pageOverrides"]> =
	{
		chat: {
			ChatMessage: (props) => {
				props.message;
				return null;
			},
		},
		chatConversation: {
			ChatMessage: (props) => {
				props.message;
				return null;
			},
		},
	};
void validPageOverrides;

const invalidPage: NonNullable<AiChatPluginOverrides["pageOverrides"]> = {
	// @ts-expect-error Only built-in route keys are supported.
	unknownPage: {},
};
void invalidPage;

const invalidSlot: NonNullable<AiChatPluginOverrides["pageOverrides"]> = {
	chat: {
		// @ts-expect-error Slot names follow the page's native composition.
		UnknownComponent: () => null,
	},
};
void invalidSlot;

const invalidProps: NonNullable<AiChatPluginOverrides["pageOverrides"]> = {
	chat: {
		// @ts-expect-error Components receive native presentation props, not arbitrary route parameters.
		ChatMessage: (_props: { unrelated: string }) => null,
	},
};
void invalidProps;
