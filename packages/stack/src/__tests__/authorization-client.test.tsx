// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import {
	AuthorizationResponseValidationError,
	createRemoteAuthorizationEvaluator,
} from "../authorization/remote";
import { StackProvider } from "../context";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const blogPermissions = definePermissions("blog", {
	post: {
		delete: permission(
			z.object({ id: z.string(), authorId: z.string().optional() }),
		),
	},
});

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [
		blog.post.delete.when(
			({ identity, facts }) =>
				identity !== null &&
				(identity.role === "admin" || identity.id === facts.authorId),
		),
	],
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.restoreAllMocks();
});

async function render(ui: React.ReactElement) {
	await act(async () => root.render(ui));
}

describe("createClientAuth", () => {
	it("evaluates remote permissions asynchronously without a reusable cache", async () => {
		const transport = vi.fn(async (request) => ({
			version: request.version,
			allowed: true,
		}));
		const evaluator = createRemoteAuthorizationEvaluator({
			contract: authorization.contract,
			transport,
		});
		const clientAuth = createClientAuth({
			evaluator,
			getIdentity: () => ({ id: "user-1", role: "user" as const }),
		});
		let firstState: ReturnType<typeof clientAuth.useCan> | undefined;
		let secondState: ReturnType<typeof clientAuth.useCan> | undefined;

		function Probe() {
			const permissionRequest = blogPermissions.post.delete({ id: "post-1" });
			firstState = clientAuth.useCan(permissionRequest);
			secondState = clientAuth.useCan(permissionRequest);
			return null;
		}

		await render(
			<StackProvider basePath="/pages" auth={clientAuth}>
				<Probe />
			</StackProvider>,
		);

		expect(firstState).toEqual({ can: true, isPending: false });
		expect(secondState).toEqual({ can: true, isPending: false });
		expect(transport).toHaveBeenCalledTimes(2);
	});

	it("surfaces remote protocol failures instead of treating them as denials", async () => {
		const evaluator = createRemoteAuthorizationEvaluator({
			contract: authorization.contract,
			transport: async () => ({
				version: authorization.contract.version,
				allowed: "not-a-boolean",
			}),
		});
		const clientAuth = createClientAuth({
			evaluator,
			getIdentity: () => ({ id: "user-1", role: "user" as const }),
		});
		let canState: ReturnType<typeof clientAuth.useCan> | undefined;

		function Probe() {
			canState = clientAuth.useCan(
				blogPermissions.post.delete({ id: "post-1" }),
			);
			return null;
		}

		await render(
			<StackProvider basePath="/pages" auth={clientAuth}>
				<Probe />
			</StackProvider>,
		);

		expect(canState?.can).toBe(false);
		expect(canState?.isPending).toBe(false);
		expect(canState?.error).toBeInstanceOf(
			AuthorizationResponseValidationError,
		);
	});

	it("binds typed hooks and evaluates the shared rule locally", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const clientAuth = createClientAuth({
			authorization,
			getIdentity: () => ({ id: "admin-1", role: "admin" as const }),
		});
		let identityState: ReturnType<typeof clientAuth.useIdentity> | undefined;
		let canState: ReturnType<typeof clientAuth.useCan> | undefined;

		function Probe() {
			identityState = clientAuth.useIdentity();
			canState = clientAuth.useCan(
				blogPermissions.post.delete({ id: "post-1" }),
			);
			return (
				<clientAuth.CanAccess
					permission={blogPermissions.post.delete({ id: "post-1" })}
				>
					<button type="button">Delete</button>
				</clientAuth.CanAccess>
			);
		}

		await render(
			<StackProvider basePath="/pages" auth={clientAuth}>
				<Probe />
			</StackProvider>,
		);

		expect(identityState).toMatchObject({
			identity: { id: "admin-1", role: "admin" },
			isPending: false,
		});
		expect(canState).toEqual({ can: true, isPending: false });
		expect(container.textContent).toBe("Delete");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("exposes identity validation errors instead of treating them as anonymous", async () => {
		const clientAuth = createClientAuth({
			authorization,
			getIdentity: () => ({ id: "user-1", role: "owner" }) as never,
		});
		let identityState: ReturnType<typeof clientAuth.useIdentity> | undefined;
		let canState: ReturnType<typeof clientAuth.useCan> | undefined;

		function Probe() {
			identityState = clientAuth.useIdentity();
			canState = clientAuth.useCan(
				blogPermissions.post.delete({ id: "post-1" }),
			);
			return null;
		}

		await render(
			<StackProvider basePath="/pages" auth={clientAuth}>
				<Probe />
			</StackProvider>,
		);

		expect(identityState?.identity).toBeNull();
		expect(identityState?.error).toBeInstanceOf(z.ZodError);
		expect(canState?.can).toBe(false);
		expect(canState?.error).toBe(identityState?.error);
	});

	it("exposes rule failures instead of converting them to denial", async () => {
		const failingAuthorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [blogPermissions] as const,
			rules: ({ blog }) => [
				blog.post.delete.when(() => {
					throw new Error("policy unavailable");
				}),
			],
		});
		const clientAuth = createClientAuth({
			authorization: failingAuthorization,
			getIdentity: () => ({ id: "user-1" }),
		});
		let canState: ReturnType<typeof clientAuth.useCan> | undefined;

		function Probe() {
			canState = clientAuth.useCan(
				blogPermissions.post.delete({ id: "post-1" }),
			);
			return null;
		}

		await render(
			<StackProvider basePath="/pages" auth={clientAuth}>
				<Probe />
			</StackProvider>,
		);

		expect(canState?.error).toEqual(new Error("policy unavailable"));
	});
});
