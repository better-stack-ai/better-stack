import { createClientAuth } from "@btst/stack/authorization/client";
import {
	createRemoteAuthorizationEvaluator,
	parseRemoteAuthorizationRequest,
} from "@btst/stack/authorization/remote";
import {
	publishedAuthorizationContract,
	publishedPermissions,
} from "./contract";

const evaluator = createRemoteAuthorizationEvaluator({
	contract: publishedAuthorizationContract,
	transport: async (request) => {
		const permissionId: "documents:document.delete" = request.permission.id;
		const documentId: string = request.permission.facts.id;
		void permissionId;
		void documentId;
		return { version: request.version, allowed: true };
	},
});

const clientAuth = createClientAuth({
	evaluator,
	getIdentity: () => ({ id: "user-1", role: "user" as const }),
});

clientAuth.useCan(
	publishedPermissions.document.delete({
		id: "document-1",
		ownerId: "owner-1",
	}),
);

parseRemoteAuthorizationRequest(publishedAuthorizationContract, {
	version: publishedAuthorizationContract.version,
	permission: {
		id: "documents:document.delete",
		facts: { id: "document-1", ownerId: "owner-1" },
	},
});

// @ts-expect-error the published identity schema rejects unknown roles
createClientAuth({
	evaluator,
	getIdentity: () => ({ id: "user-1", role: "owner" }),
});

// @ts-expect-error published permission facts retain their exact types
publishedPermissions.document.delete({ id: 1, ownerId: "owner-1" });
