import { resolveTanStackInitialIdentity } from "@btst/stack/tanstack/server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { hydrationAuth } from "./authorization.server";
import { getRequestClientOrigins } from "./stack-client.server";

/** Resolve the validated identity from the current TanStack Start request. */
export const getInitialIdentity = createServerFn({ method: "GET" }).handler(
	async () => {
		const request = getRequest();
		return {
			...(await resolveTanStackInitialIdentity({
				auth: hydrationAuth,
				request,
			})),
			...getRequestClientOrigins(request),
		};
	},
);
