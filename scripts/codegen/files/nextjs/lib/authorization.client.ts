"use client";

import { createClientAuth } from "@btst/stack/authorization/client";
import { createRemoteAuthorizationEvaluator } from "@btst/stack/authorization/remote";
import { authorization } from "./authorization";

const evaluator = createRemoteAuthorizationEvaluator({
	contract: authorization.contract,
	transport: async (request) => ({
		version: request.version,
		allowed: true,
	}),
});

export const clientAuth = createClientAuth({
	evaluator,
	getIdentity: () => ({ id: "olliethedev", role: "admin" as const }),
});
