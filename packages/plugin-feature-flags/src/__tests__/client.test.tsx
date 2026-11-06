// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createClientStack } from "@btst/stack/client";
import { createIdentityTestAuth } from "../../../stack/src/__tests__/auth-test-utils";
import { featureFlagsClientPlugin } from "../client/plugin";
import {
	useCreateFlag,
	useFlag,
	useFlags,
	useToggleFlag,
} from "../client/hooks";
import type { FlagContext } from "../types";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ context }: { context: FlagContext }) {
	const flag = useFlag("checkout", context);
	const toggle = useToggleFlag();
	return (
		<>
			<output>{flag.data === undefined ? "pending" : String(flag.data)}</output>
			<button
				type="button"
				onClick={() => toggle.mutate({ key: "checkout", enabled: true })}
			>
				Toggle
			</button>
		</>
	);
}

function FlagListProbe() {
	const { data } = useFlags();
	return (
		<output>{data?.map((flag) => flag.name).join(",") ?? "pending"}</output>
	);
}

function ManagementProbe() {
	const [showList, setShowList] = useState(true);
	const create = useCreateFlag();
	return showList ? (
		<>
			<FlagListProbe />
			<button type="button" onClick={() => setShowList(false)}>
				New
			</button>
		</>
	) : (
		<button
			type="button"
			onClick={() =>
				create.mutate(
					{ key: "checkout", name: "Checkout" },
					{ onSuccess: () => setShowList(true) },
				)
			}
		>
			Create
		</button>
	);
}

async function waitFor(check: () => boolean) {
	const deadline = Date.now() + 3000;
	while (!check()) {
		if (Date.now() > deadline)
			throw new Error("Feature flag query did not settle");
		await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
	}
}

describe("feature flag client evaluation", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	const identity = { id: "admin" };
	const auth = createIdentityTestAuth(() => identity);

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		queryClient = new QueryClient();
	});
	afterEach(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
		container.remove();
		vi.restoreAllMocks();
	});

	async function render(context: FlagContext, tenant = "A") {
		const stack = createClientStack({
			api: { baseURL: "https://flags.test", basePath: "/api/data" },
			site: { baseURL: "https://flags.test", basePath: "/pages" },
			queryClient,
			plugins: { featureFlags: featureFlagsClientPlugin() },
			endpoints: {
				featureFlags: {
					api: {
						basePath: "/api/data",
						browserHeaders: { "x-tenant": tenant },
					},
				},
			},
		});
		await act(async () =>
			root.render(
				<StackProvider stack={stack} auth={auth} initialIdentity={identity}>
					<QueryClientProvider client={queryClient}>
						<Probe context={context} />
					</QueryClientProvider>
				</StackProvider>,
			),
		);
	}

	it("keeps results separate by context and tenant and forwards UTF-8 targeting", async () => {
		const seen: FlagContext[] = [];
		const pendingResponses: (() => void)[] = [];
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async (input, init) => {
				const url = new URL(
					input instanceof Request ? input.url : String(input),
				);
				const context = JSON.parse(
					new TextDecoder().decode(
						Uint8Array.from(atob(url.searchParams.get("context")!), (char) =>
							char.charCodeAt(0),
						),
					),
				) as FlagContext;
				seen.push(context);
				const enabled =
					new Headers(init?.headers).get("x-tenant") === "B" ||
					context.userId === "Zoë";
				return new Promise<Response>((resolve) => {
					pendingResponses.push(() => resolve(Response.json(enabled)));
				});
			});
		await render({ userId: "Zoë", tags: ["équipe"] });
		expect(container.querySelector("output")?.textContent).toBe("pending");
		expect(pendingResponses).toHaveLength(1);
		await act(async () => pendingResponses.shift()!());
		await waitFor(
			() => container.querySelector("output")?.textContent === "true",
		);
		expect(seen[0]).toEqual({ userId: "Zoë", tags: ["équipe"] });
		await render({ userId: "other" });
		expect(container.querySelector("output")?.textContent).toBe("pending");
		expect(pendingResponses).toHaveLength(1);
		await act(async () => pendingResponses.shift()!());
		await waitFor(
			() => container.querySelector("output")?.textContent === "false",
		);
		await render({ userId: "other" }, "B");
		expect(container.querySelector("output")?.textContent).toBe("pending");
		expect(pendingResponses).toHaveLength(1);
		await act(async () => pendingResponses.shift()!());
		await waitFor(
			() => container.querySelector("output")?.textContent === "true",
		);
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("refreshes the inactive flag list before returning from create", async () => {
		const definitions: { key: string; name: string }[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
			if (init?.method === "POST") {
				const flag = JSON.parse(String(init.body));
				definitions.push(flag);
				return Response.json(flag);
			}
			return Response.json([...definitions]);
		});
		const stack = createClientStack({
			api: { baseURL: "https://flags.test", basePath: "/api/data" },
			site: { baseURL: "https://flags.test", basePath: "/pages" },
			queryClient,
			plugins: { featureFlags: featureFlagsClientPlugin() },
		});
		await act(async () =>
			root.render(
				<StackProvider stack={stack} auth={auth} initialIdentity={identity}>
					<QueryClientProvider client={queryClient}>
						<ManagementProbe />
					</QueryClientProvider>
				</StackProvider>,
			),
		);
		await waitFor(() => container.querySelector("output")?.textContent === "");
		await act(async () => container.querySelector("button")!.click());
		expect(container.querySelector("output")).toBeNull();
		await act(async () => container.querySelector("button")!.click());
		await waitFor(
			() => container.querySelector("output")?.textContent === "Checkout",
		);
	});

	it("refreshes a mounted useFlag result after a management toggle", async () => {
		let enabled = false;
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			if (url.pathname.endsWith("/toggle")) {
				enabled = JSON.parse(String(init?.body)).enabled;
				return Response.json({ key: "checkout", enabled });
			}
			return Response.json(enabled);
		});
		await render({ userId: "viewer" });
		await waitFor(
			() => container.querySelector("output")?.textContent === "false",
		);
		await act(async () => container.querySelector("button")!.click());
		await waitFor(
			() => container.querySelector("output")?.textContent === "true",
		);
	});
});
