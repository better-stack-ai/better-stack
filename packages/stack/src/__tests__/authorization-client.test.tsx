// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	defineAuthorization,
	defineAuthorizationContract,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import {
	AuthorizationRequestValidationError,
	AuthorizationResponseValidationError,
	createRemoteAuthorizationEvaluator,
} from "../authorization/remote";
import { StackProvider, useIdentity } from "../context";

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
	it("does not treat an unrelated custom-provider contract as the one-rule parser", async () => {
		const parseIdentity = vi.fn(() => {
			throw new Error("unrelated parser called");
		});
		const provider = {
			getIdentity: () => null,
			contract: { parseIdentity },
		};
		let identityState: ReturnType<typeof useIdentity> | undefined;

		function Probe() {
			identityState = useIdentity();
			return null;
		}

		await render(
			<StackProvider
				basePath="/pages"
				auth={provider}
				initialIdentity={{ id: "custom-user" }}
			>
				<Probe />
			</StackProvider>,
		);

		expect(identityState).toMatchObject({
			identity: { id: "custom-user" },
			isPending: false,
		});
		expect(parseIdentity).not.toHaveBeenCalled();
	});

	it("keeps an omitted identity snapshot pending while the browser resolver runs", async () => {
		const getIdentity = vi.fn(() => new Promise<never>(() => {}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
		let identityState: ReturnType<typeof clientAuth.useIdentity> | undefined;

		function Probe() {
			identityState = clientAuth.useIdentity();
			return null;
		}

		await render(
			<StackProvider basePath="/pages" auth={clientAuth}>
				<Probe />
			</StackProvider>,
		);

		expect(identityState).toMatchObject({ identity: null, isPending: true });
		expect(getIdentity).toHaveBeenCalledOnce();
	});

	it("starts from a hydrated authenticated identity without calling the browser resolver", async () => {
		const getIdentity = vi.fn(() => ({
			id: "browser-user",
			role: "user" as const,
		}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
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
			<StackProvider
				basePath="/pages"
				auth={clientAuth}
				initialIdentity={{ id: "server-admin", role: "admin" }}
			>
				<Probe />
			</StackProvider>,
		);

		expect(identityState).toMatchObject({
			identity: { id: "server-admin", role: "admin" },
			isPending: false,
		});
		expect(canState).toEqual({ can: true, isPending: false });
		expect(getIdentity).not.toHaveBeenCalled();
	});

	it("keeps an explicit hydrated anonymous identity settled without calling the browser resolver", async () => {
		const getIdentity = vi.fn(() => ({
			id: "browser-user",
			role: "admin" as const,
		}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
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
			<StackProvider basePath="/pages" auth={clientAuth} initialIdentity={null}>
				<Probe />
			</StackProvider>,
		);

		expect(identityState).toMatchObject({ identity: null, isPending: false });
		expect(canState).toEqual({ can: false, isPending: false });
		expect(getIdentity).not.toHaveBeenCalled();
	});

	it("surfaces an invalid hydrated identity as an identity error", async () => {
		const getIdentity = vi.fn(() => ({
			id: "browser-user",
			role: "user" as const,
		}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
		let identityState: ReturnType<typeof clientAuth.useIdentity> | undefined;

		function Probe() {
			identityState = clientAuth.useIdentity();
			return null;
		}

		await render(
			<StackProvider
				basePath="/pages"
				auth={clientAuth}
				initialIdentity={{ id: "server-user", role: "owner" } as never}
			>
				<Probe />
			</StackProvider>,
		);

		expect(identityState).toMatchObject({ identity: null, isPending: false });
		expect(identityState?.error).toBeInstanceOf(z.ZodError);
		expect(getIdentity).not.toHaveBeenCalled();
	});

	it("can explicitly refresh after starting from a hydrated identity", async () => {
		const getIdentity = vi.fn(() => ({
			id: "browser-user",
			role: "user" as const,
		}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
		let identityState: ReturnType<typeof clientAuth.useIdentity> | undefined;

		function Probe() {
			identityState = clientAuth.useIdentity();
			return null;
		}

		await render(
			<StackProvider
				basePath="/pages"
				auth={clientAuth}
				initialIdentity={{ id: "server-user", role: "admin" }}
			>
				<Probe />
			</StackProvider>,
		);

		expect(getIdentity).not.toHaveBeenCalled();
		await act(async () => identityState?.refetch());
		expect(getIdentity).toHaveBeenCalledOnce();
		expect(identityState).toMatchObject({
			identity: { id: "browser-user", role: "user" },
			isPending: false,
		});
	});

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

	it("does not restart remote checks on unrelated renders or accept stale completions", async () => {
		type Deferred = {
			promise: Promise<{ version: string; allowed: boolean }>;
			resolve: (allowed: boolean) => void;
		};
		const deferred: Deferred[] = [];
		const transport = vi.fn((request) => {
			let resolvePromise: ((allowed: boolean) => void) | undefined;
			const promise = new Promise<{ version: string; allowed: boolean }>(
				(resolve) => {
					resolvePromise = (allowed) =>
						resolve({ version: request.version, allowed });
				},
			);
			deferred.push({
				promise,
				resolve: resolvePromise as (allowed: boolean) => void,
			});
			return promise;
		});
		const evaluator = createRemoteAuthorizationEvaluator({
			contract: authorization.contract,
			transport,
		});
		const clientAuth = createClientAuth({
			evaluator,
			getIdentity: () => ({ id: "user-1", role: "user" as const }),
		});
		let canState: ReturnType<typeof clientAuth.useCan> | undefined;

		function Probe({ postId }: { postId: string }) {
			canState = clientAuth.useCan(blogPermissions.post.delete({ id: postId }));
			return null;
		}
		function App({ postId, unrelated }: { postId: string; unrelated: number }) {
			return (
				<StackProvider basePath="/pages" auth={clientAuth}>
					<span>{unrelated}</span>
					<Probe postId={postId} />
				</StackProvider>
			);
		}

		await render(<App postId="post-1" unrelated={0} />);
		expect(transport).toHaveBeenCalledTimes(1);

		await render(<App postId="post-1" unrelated={1} />);
		expect(transport).toHaveBeenCalledTimes(1);

		await render(<App postId="post-2" unrelated={1} />);
		expect(transport).toHaveBeenCalledTimes(2);
		expect(canState).toEqual({ can: false, isPending: true });

		await act(async () => deferred[1]?.resolve(true));
		expect(canState).toEqual({ can: true, isPending: false });

		await act(async () => deferred[0]?.resolve(false));
		expect(canState).toEqual({ can: true, isPending: false });
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

	it("surfaces non-JSON facts as typed errors instead of render failures", async () => {
		const portablePermissions = definePermissions("portable", {
			inspect: permission(z.object({ value: z.string() })),
		});
		const portableContract = defineAuthorizationContract({
			identity: z.object({ id: z.string() }),
			permissions: [portablePermissions] as const,
		});
		const transport = vi.fn();
		const evaluator = createRemoteAuthorizationEvaluator({
			contract: portableContract,
			transport,
		});
		const clientAuth = createClientAuth({
			evaluator,
			getIdentity: () => ({ id: "user-1" }),
		});
		let canState: ReturnType<typeof clientAuth.useCan> | undefined;

		function Probe() {
			canState = clientAuth.useCan({
				id: "portable:inspect",
				facts: { value: 1n },
			} as never);
			return null;
		}

		await render(
			<StackProvider basePath="/pages" auth={clientAuth}>
				<Probe />
			</StackProvider>,
		);

		expect(canState).toMatchObject({ can: false, isPending: false });
		expect(canState?.error).toBeInstanceOf(AuthorizationRequestValidationError);
		expect(transport).not.toHaveBeenCalled();
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
