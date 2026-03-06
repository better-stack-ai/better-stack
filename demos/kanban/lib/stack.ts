import { stack } from "@btst/stack";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { kanbanBackendPlugin } from "@btst/stack/plugins/kanban/api";
import { openApiBackendPlugin } from "@btst/stack/plugins/open-api/api";
import { seedKanbanData } from "./seed";

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

globalForStack.__btst_seeded__ ??= seedKanbanData(myStack.adapter).catch(
	console.error,
);

export const { handler, dbSchema } = myStack;
