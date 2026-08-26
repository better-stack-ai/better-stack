import { createClientAuth } from "@btst/stack/authorization/client";
import { authorization } from "./authorization";

export const clientAuth = createClientAuth({
	authorization,
	getIdentity: () => ({ id: "olliethedev", role: "admin" as const }),
});
