import type { FeedbackPluginOverrides } from "../client";

const valid: FeedbackPluginOverrides = {
	kanbanTaskSlot: (post) => <span>{post.kanbanTaskId}</span>,
	postBottomSlot: (post) => <span>{post.title}</span>,
	pageOverrides: {
		feedback: { PostCard: (props) => <span>{props.post.title}</span> },
		feedbackRoadmap: { PostCard: (props) => <span>{props.post.title}</span> },
	},
};
void valid;
const invalidPage: FeedbackPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Only audited built-in page keys are supported.
		unknownPage: {},
	},
};
const invalidSlot: FeedbackPluginOverrides = {
	pageOverrides: {
		feedback: {
			// @ts-expect-error Slots are specific to this page composition.
			UnknownComponent: () => null,
		},
	},
};
const invalidProps: FeedbackPluginOverrides = {
	pageOverrides: {
		feedback: {
			// @ts-expect-error Replacement components must accept the built-in props.
			PostCard: (_props: { impossible: string }) => null,
		},
	},
};
void invalidPage;
void invalidSlot;
void invalidProps;
