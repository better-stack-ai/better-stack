import { stack } from "@btst/stack";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { formBuilderBackendPlugin } from "@btst/stack/plugins/form-builder/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { seedFormBuilderData } from "./seed";

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
			formBuilder: formBuilderBackendPlugin(),
			openApi: openApiBackendPlugin({
				title: "BTST Form Builder Demo API",
				description: "API for the BTST form-builder plugin demo",
				theme: "kepler",
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
	});
}

export const myStack = (globalForStack.__btst_stack__ ??= createStack());

globalForStack.__btst_seeded__ ??= seedFormBuilderData(myStack.adapter).catch(
	console.error,
);

export const { handler, dbSchema } = myStack;
