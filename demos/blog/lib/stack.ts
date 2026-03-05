import { stack } from "@btst/stack";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { blogBackendPlugin } from "@btst/stack/plugins/blog/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { seedBlogData } from "./seed";

const globalForStack = global as typeof global & {
	__btst_stack__?: ReturnType<typeof createStack>;
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

// Seed demo data after singleton is created
seedBlogData(myStack.adapter).catch(console.error);

export const { handler, dbSchema } = myStack;
