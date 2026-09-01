"use client";

import { createClientAuth } from "@btst/stack/authorization/client";
import { authorization } from "./authorization";

export const clientAuth = createClientAuth({
	authorization,
	// Framework layouts hydrate the request identity. Replace this mock with
	// your auth client's session resolver so refetch() follows login/logout.
	getIdentity: () => null,
});
