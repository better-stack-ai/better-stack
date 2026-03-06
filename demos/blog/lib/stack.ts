import { stack } from "@btst/stack";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { blogBackendPlugin } from "@btst/stack/plugins/blog/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { seedBlogData } from "./seed";

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
			blog: blogBackendPlugin(),
			openApi: openApiBackendPlugin({
				title: "BTST Blog Demo API",
				description: "API for the BTST blog plugin demo",
				theme: "kepler",
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
	});
}

export const myStack = (globalForStack.__btst_stack__ ??= createStack());

globalForStack.__btst_seeded__ ??= seedBlogData(myStack.adapter).catch(
	console.error,
);

export const { handler, dbSchema } = myStack;
