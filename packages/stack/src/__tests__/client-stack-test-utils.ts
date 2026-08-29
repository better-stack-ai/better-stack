import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "../client";
import type {
	ClientApiConfig,
	ClientLocation,
	ClientPluginRegistration,
	MatchingPluginRegistrations,
} from "../types";

const TEST_ORIGIN = "http://test.local";

/** Builds the same canonical client runtime that consumers pass to StackProvider. */
export function createTestClientStack<
	const TPlugins extends Record<
		string,
		ClientPluginRegistration<any, any, any, any, any>
	>,
>(
	plugins: TPlugins & MatchingPluginRegistrations<TPlugins>,
	queryClient = new QueryClient(),
	locations: {
		api?: ClientApiConfig;
		site?: ClientLocation;
	} = {},
) {
	return createClientStack<TPlugins>({
		api: locations.api ?? { baseURL: TEST_ORIGIN, basePath: "/api/data" },
		site: locations.site ?? { baseURL: TEST_ORIGIN, basePath: "/pages" },
		queryClient,
		plugins,
	});
}

export function createEmptyTestClientStack(queryClient = new QueryClient()) {
	return createTestClientStack({}, queryClient);
}
