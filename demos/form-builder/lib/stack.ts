import { stack } from "@btst/stack";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { formBuilderBackendPlugin } from "@btst/stack/plugins/form-builder/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { seedFormBuilderData } from "./seed";

// In-memory adapter only: Next.js evaluates this module in multiple bundle contexts
// (API routes + page bundle) that share the same process. Pin to globalThis so both
// contexts reference the same in-memory store.
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
