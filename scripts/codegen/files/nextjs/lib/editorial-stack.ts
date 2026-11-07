import "server-only";

import { createBackendStack } from "@btst/stack";
import { createServerAuth } from "@btst/stack/authorization/server";
import { blogBackendPlugin } from "@btst/plugin-blog/api";
import { createMemoryAdapter } from "./adapters-build-check";
import { editorialAuthorization } from "./editorial-authorization";
import { hydrationAuth } from "./authorization.server";

export const editorialServerAuth = createServerAuth({
	authorization: editorialAuthorization,
	getIdentityFromHeaders: ({ headers }) =>
		hydrationAuth.getIdentityFromHeaders({ headers }),
});

export const editorialStack = createBackendStack({
	basePath: "/api/editorial",
	auth: editorialServerAuth,
	plugins: { blog: blogBackendPlugin({ editorialWorkflow: true }) },
	adapter: (db) => createMemoryAdapter(db)({}),
});
