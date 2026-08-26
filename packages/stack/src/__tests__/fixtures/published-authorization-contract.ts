import { z } from "zod";
import {
	defineAuthorizationContract,
	definePermissions,
	permission,
} from "../../authorization";

export const publishedPermissions = definePermissions("documents", {
	document: {
		delete: permission(z.object({ id: z.string(), ownerId: z.string() })),
	},
});

export const publishedAuthorizationContract = defineAuthorizationContract({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [publishedPermissions] as const,
});
