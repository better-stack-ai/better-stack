import { resolveTanStackInitialIdentity } from "@btst/stack/tanstack/server";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { serverAuth } from "./authorization.server";

/** Resolve the validated identity from the current TanStack Start request. */
export const getInitialIdentity = createServerFn({ method: "GET" }).handler(
	async () =>
		resolveTanStackInitialIdentity({
			auth: serverAuth,
			request: getRequest(),
		}),
);
