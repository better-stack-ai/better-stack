import { stack } from "@btst/stack";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { kanbanBackendPlugin } from "@btst/stack/plugins/kanban/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { seedKanbanData } from "./seed";

const globalForStack = global as typeof global & {
	__btst_stack__?: ReturnType<typeof createStack>;
};

function createStack() {
	return stack({
		basePath: "/api/data",
		plugins: {
			kanban: kanbanBackendPlugin(),
			openApi: openApiBackendPlugin({
				title: "BTST Kanban Demo API",
				description: "API for the BTST kanban plugin demo",
				theme: "kepler",
			}),
		},
		adapter: (db) => createMemoryAdapter(db)({}),
	});
}

export const myStack = (globalForStack.__btst_stack__ ??= createStack());

seedKanbanData(myStack.adapter).catch(console.error);

export const { handler, dbSchema } = myStack;
