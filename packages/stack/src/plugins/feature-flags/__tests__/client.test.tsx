// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createClientStack } from "../../../client";
import { createIdentityTestAuth } from "../../../__tests__/auth-test-utils";
import { featureFlagsClientPlugin } from "../client/plugin";
import { useFlag, useToggleFlag } from "../client/hooks";
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
				return Response.json(
					new Headers(init?.headers).get("x-tenant") === "B" ||
						context.userId === "Zoë",
				);
			});
		await render({ userId: "Zoë", tags: ["équipe"] });
		await waitFor(
			() => container.querySelector("output")?.textContent === "true",
		);
		expect(seen[0]).toEqual({ userId: "Zoë", tags: ["équipe"] });
		await render({ userId: "other" });
		expect(container.querySelector("output")?.textContent).toBe("pending");
		await waitFor(
			() => container.querySelector("output")?.textContent === "false",
		);
		await render({ userId: "other" }, "B");
		expect(container.querySelector("output")?.textContent).toBe("pending");
		await waitFor(
			() => container.querySelector("output")?.textContent === "true",
		);
		expect(fetchMock).toHaveBeenCalledTimes(3);
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
