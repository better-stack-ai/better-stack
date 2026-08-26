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
		inspect: permission(z.any()),
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
	it("uses backend-owned identity and facts for the authoritative decision", async () => {
		let backendIdentity = { id: "outsider", role: "user" as const };
		const records = new Map([
			["document-1", { id: "document-1", ownerId: "owner-1" }],
		]);
		const transport = vi.fn(async (request) => {
			const parsed = parseRemoteAuthorizationRequest(contract, request);
			const record = records.get(parsed.permission.facts.id);
			if (!record) throw new Error("Document not found");
			return {
				version: contract.version,
				allowed: backendAuthorization.can(
					documentPermissions.document.delete(record),
					backendIdentity,
				),
			};
		});
		const evaluator = createRemoteAuthorizationEvaluator({
			contract,
			transport,
		});

		const spoofedPermission = documentPermissions.document.delete({
			id: "document-1",
			ownerId: "outsider",
		});
		await expect(
			evaluator.evaluate({
				identity: { id: "browser-user", role: "admin" },
				permission: spoofedPermission,
			}),
		).resolves.toBe(false);

		backendIdentity = { id: "owner-1", role: "user" };
		await expect(
			evaluator.evaluate({
				identity: null,
				permission: spoofedPermission,
			}),
		).resolves.toBe(true);
		expect(transport).toHaveBeenLastCalledWith({
			version: contract.version,
			permission: {
				id: "documents:document.delete",
				facts: { id: "document-1", ownerId: "outsider" },
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

		expect(() =>
			parseRemoteAuthorizationRequest(contract, {
				version: contract.version,
				permission: {
					id: "documents:document.delete",
					facts: { id: "document-1", ownerId: "owner-1" },
					identity: { id: "browser-user", role: "admin" },
				},
			}),
		).toThrow(AuthorizationRequestValidationError);

		expect(() =>
			parseRemoteAuthorizationRequest(contract, {
				version: contract.version,
				permission: {
					id: "documents:document.inspect",
					facts: 1n,
				},
			}),
		).toThrow(AuthorizationRequestValidationError);

		const inheritedRequest = Object.assign(Object.create({ inherited: true }), {
			version: contract.version,
			permission: { id: "documents:document.inspect", facts: null },
		});
		expect(() =>
			parseRemoteAuthorizationRequest(contract, inheritedRequest),
		).toThrow(AuthorizationRequestValidationError);
	});

	it("rejects permission facts that cannot cross a JSON transport", async () => {
		const transport = vi.fn();
		const evaluator = createRemoteAuthorizationEvaluator({
			contract,
			transport,
		});

		await expect(
			evaluator.evaluate({
				identity: null,
				permission: documentPermissions.document.inspect(1n),
			}),
		).rejects.toBeInstanceOf(AuthorizationRequestValidationError);
		expect(transport).not.toHaveBeenCalled();
	});

	it("rejects non-JSON response envelopes", async () => {
		const response = Object.create({ inherited: true }) as {
			version: string;
			allowed: boolean;
		};
		response.version = contract.version;
		response.allowed = true;
		const evaluator = createRemoteAuthorizationEvaluator({
			contract,
			transport: async () => response,
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
});
