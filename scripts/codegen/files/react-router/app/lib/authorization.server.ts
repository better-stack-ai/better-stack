import { createServerAuth } from "@btst/stack/authorization/server";
import { authorization } from "./authorization";

export const serverAuth = createServerAuth({
	authorization,
	getIdentity: () => ({ id: "olliethedev", role: "admin" as const }),
});
