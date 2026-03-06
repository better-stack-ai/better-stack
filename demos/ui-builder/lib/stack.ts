import { stack } from "@btst/stack";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { cmsBackendPlugin } from "@btst/stack/plugins/cms/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { UI_BUILDER_CONTENT_TYPE } from "@btst/stack/plugins/ui-builder";
import { seedUIBuilderData } from "./seed";

// Persist stack and seed promise on `global` so Next.js module re-evaluations
// (HMR, per-request server components) don't create a second instance or re-run the seed.
const globalForStack = global as typeof global & {
	__btst_stack__?: ReturnType<typeof createStack>;
	__btst_seeded__?: Promise<void>;
};

function createStack() {
	return stack({
		basePath: "/api/data",
		plugins: {
			cms: cmsBackendPlugin({
				contentTypes: [UI_BUILDER_CONTENT_TYPE],
			}),
			openApi: openApiBackendPlugin({
				title: "BTST UI Builder Demo API",
				description: "API for the BTST ui-builder plugin demo",
				theme: "kepler",
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
	});
}

export const myStack = (globalForStack.__btst_stack__ ??= createStack());

globalForStack.__btst_seeded__ ??= seedUIBuilderData(myStack.api).catch(
	console.error,
);

export const { handler, dbSchema } = myStack;
