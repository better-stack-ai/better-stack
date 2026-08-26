import "server-only";

import { existsSync } from "node:fs";
import { createServerAuth } from "@btst/stack/authorization/server";
import { authorization } from "./authorization";

export const serverAuth = createServerAuth({
	authorization,
	getIdentity: () => ({
		id: existsSync(process.cwd()) ? "olliethedev" : "fixture-user",
		role: "admin" as const,
	}),
});
