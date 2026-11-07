import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
} from "@btst/stack/plugins/api";
import { searchInputSchema } from "../schemas";
import type { SearchBackendConfig } from "../types";
import { createSearchOperations } from "./operations";

export const searchBackendPlugin = (config: SearchBackendConfig = {}) => {
	const operations = createSearchOperations(config.providers ?? []);
	return defineBackendPlugin({
		id: "search",
		dbPlugin: createDbPlugin("search", {}),
		operations: () => operations,
		routes: (_adapter, _context, bound) => ({
			search: createEndpoint(
				"/search",
				{ method: "GET", query: searchInputSchema, requireRequest: true },
				bound.search.route((ctx) => ctx.query),
			),
		}),
	});
};

export type SearchApiRouter = ReturnType<
	ReturnType<typeof searchBackendPlugin>["routes"]
>;
