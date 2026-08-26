import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	defineAuthorization,
	defineAuthorizationContract,
	definePermissions,
	permission,
} from "../authorization";
import {
	AuthorizationContractMismatchError,
	AuthorizationRequestValidationError,
	AuthorizationResponseValidationError,
	createRemoteAuthorizationEvaluator,
	parseRemoteAuthorizationRequest,
} from "../authorization/remote";

const documentPermissions = definePermissions("documents", {
	document: {
		delete: permission(z.object({ id: z.string(), ownerId: z.string() })),
	},
});

const contract = defineAuthorizationContract({
	identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
	permissions: [documentPermissions] as const,
});

const backendAuthorization = defineAuthorization({
	contract,
	rules: ({ documents }) => [
		documents.document.delete.when(
			({ identity, facts }) =>
				identity?.role === "admin" || identity?.id === facts.ownerId,
		),
	],
});

describe("remote authorization evaluator", () => {
	it("uses a typed portable request while the backend makes the authoritative decision", async () => {
		const transport = vi.fn(async (request) => {
			const parsed = parseRemoteAuthorizationRequest(contract, request);
			return {
				version: contract.version,
				allowed: backendAuthorization.can(parsed.permission, {
					id: "server-session-user",
					role: "admin",
				}),
			};
		});
		const evaluator = createRemoteAuthorizationEvaluator({
			contract,
			transport,
		});

		await expect(
			evaluator.evaluate({
				identity: { id: "browser-user", role: "user" },
				permission: documentPermissions.document.delete({
					id: "document-1",
					ownerId: "someone-else",
				}),
			}),
		).resolves.toBe(true);
		expect(transport).toHaveBeenCalledWith({
			version: contract.version,
			permission: {
				id: "documents:document.delete",
				facts: { id: "document-1", ownerId: "someone-else" },
			},
		});
	});

	it("reports contract version mismatches as typed errors", async () => {
		const evaluator = createRemoteAuthorizationEvaluator({
			contract,
			transport: async () => ({ version: "auth_outdated", allowed: false }),
		});

		await expect(
			evaluator.evaluate({
				identity: null,
				permission: documentPermissions.document.delete({
					id: "document-1",
					ownerId: "owner-1",
				}),
			}),
		).rejects.toMatchObject({
			name: "AuthorizationContractMismatchError",
			code: "AUTHORIZATION_CONTRACT_MISMATCH",
			expectedVersion: contract.version,
			receivedVersion: "auth_outdated",
		});
	});

	it("reports malformed responses as typed errors instead of denials", async () => {
		const evaluator = createRemoteAuthorizationEvaluator({
			contract,
			transport: async () => ({
				version: contract.version,
				allowed: "yes",
			}),
		});

		await expect(
			evaluator.evaluate({
				identity: null,
				permission: documentPermissions.document.delete({
					id: "document-1",
					ownerId: "owner-1",
				}),
			}),
		).rejects.toBeInstanceOf(AuthorizationResponseValidationError);
	});

	it("validates the request contract at the managed backend boundary", () => {
		expect(() =>
			parseRemoteAuthorizationRequest(contract, {
				version: "auth_outdated",
				permission: {
					id: "documents:document.delete",
					facts: { id: "document-1", ownerId: "owner-1" },
				},
			}),
		).toThrow(AuthorizationContractMismatchError);

		expect(() =>
			parseRemoteAuthorizationRequest(contract, {
				version: contract.version,
				permission: {
					id: "documents:document.delete",
					facts: { id: 1, ownerId: "owner-1" },
				},
			}),
		).toThrow(AuthorizationRequestValidationError);
	});
});
