import { createReactRouterPage } from "@btst/stack/react-router";
import { getOrCreateQueryClient } from "~/lib/query-client";
import { getStackClient } from "~/lib/stack-client";
import { getStackClientForRequest } from "~/lib/stack-client.server";

const page = createReactRouterPage({
	getStackClient,
	getQueryClient: getOrCreateQueryClient,
});

export const loader = page.createLoader((queryClient, { request }) =>
	getStackClientForRequest(queryClient, request),
);
export const meta = page.meta;
export const ErrorBoundary = page.ErrorBoundary;
export default page.Component;
