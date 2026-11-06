import type { JobBoardPluginOverrides } from "../client/overrides";

const valid: JobBoardPluginOverrides = {
	pageOverrides: { jobBoardList: { JobRow: () => null } },
};
const invalidPage: JobBoardPluginOverrides = {
	pageOverrides: {
		// @ts-expect-error Page names use the plugin's route keys.
		unknownPage: { JobRow: () => null },
	},
};
const invalidSlot: JobBoardPluginOverrides = {
	pageOverrides: {
		jobBoardList: {
			// @ts-expect-error Only the page's documented presentation slots are accepted.
			UnknownSlot: () => null,
		},
	},
};
const invalidProps: JobBoardPluginOverrides = {
	pageOverrides: {
		jobBoardList: {
			// @ts-expect-error Slot components receive the plugin's typed presentation props.
			JobRow: (_: { missing: string }) => null,
		},
	},
};
void [valid, invalidPage, invalidSlot, invalidProps];
