// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
	type MockInstance,
} from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createClientStack } from "../../../client";
import { createIdentityTestAuth } from "../../../__tests__/auth-test-utils";
import { analyticsClientPlugin } from "../client/plugin";
import {
	useDashboardStats,
	useRealtimeVisitors,
	useTopEvents,
	useTopPages,
	useTopReferrers,
} from "../client/hooks";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
	const stats = useDashboardStats();
	const pages = useTopPages();
	const referrers = useTopReferrers();
	const events = useTopEvents();
	const realtime = useRealtimeVisitors();
	return (
		<output>
			{[
				stats.data?.uniqueVisitors,
				pages.data?.[0]?.views,
				referrers.data?.[0]?.views,
				events.data?.[0]?.count,
				realtime.data?.visitors,
			].join("|")}
		</output>
	);
}

function responseFor(input: string | URL | Request, value: number) {
	const path = new URL(input instanceof Request ? input.url : String(input))
		.pathname;
	const data = path.endsWith("/dashboard")
		? { uniqueVisitors: value }
		: path.endsWith("/realtime")
			? { visitors: value }
			: [{ views: value, count: value }];
	return new Response(JSON.stringify(data), {
		headers: { "content-type": "application/json" },
	});
}

async function waitFor(check: () => boolean) {
	const deadline = Date.now() + 3000;
	while (!check()) {
		if (Date.now() > deadline)
			throw new Error("Analytics query did not settle");
		await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
	}
}

describe("analytics public transport partition", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let fetchMock: MockInstance<typeof fetch>;
	const identity = { id: "same-admin" };
	const auth = createIdentityTestAuth(() => identity);

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		queryClient = new QueryClient();
		fetchMock = vi.spyOn(globalThis, "fetch");
	});
	afterEach(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
		container.remove();
		vi.restoreAllMocks();
	});

	async function render(
		tenant: string,
		credentials?: RequestCredentials,
		headerName = "x-tenant",
	) {
		const stack = createClientStack({
			api: { baseURL: "https://site.test", basePath: "/api/data" },
			site: { baseURL: "https://site.test", basePath: "/pages" },
			queryClient,
			plugins: { analytics: analyticsClientPlugin({ tracking: false }) },
			endpoints: {
				analytics: {
					api: {
						basePath: "/api/data",
						browserHeaders: { [headerName]: tenant },
						credentials,
					},
				},
			},
		});
		await act(async () =>
			root.render(
				<StackProvider stack={stack} auth={auth} initialIdentity={identity}>
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>
				</StackProvider>,
			),
		);
	}

	it("fetches separate tenant data with one identity and QueryClient, normalizing header names", async () => {
		fetchMock.mockImplementation(async (input, init) =>
			responseFor(
				input,
				new Headers(init?.headers).get("x-tenant") === "A" ? 1 : 2,
			),
		);
		await render("A");
		await waitFor(() => container.textContent === "1|1|1|1|1");
		await render("B");
		expect(container.textContent).not.toContain("1");
		await waitFor(() => container.textContent === "2|2|2|2|2");
		expect(fetchMock).toHaveBeenCalledTimes(10);
		await render("A", undefined, "X-TENANT");
		await waitFor(() => container.textContent === "1|1|1|1|1");
		expect(fetchMock).toHaveBeenCalledTimes(10);
		await render("A", "include");
		await waitFor(
			() =>
				fetchMock.mock.calls.length === 15 &&
				container.textContent === "1|1|1|1|1",
		);
	});

	it("does not apply the prior tenant's in-flight responses after a header switch", async () => {
		const finishA: Array<() => void> = [];
		fetchMock.mockImplementation((input, init) =>
			new Headers(init?.headers).get("x-tenant") === "A"
				? new Promise<Response>((resolve) =>
						finishA.push(() => resolve(responseFor(input, 1))),
					)
				: Promise.resolve(responseFor(input, 2)),
		);
		await render("A");
		await waitFor(() => finishA.length === 5);
		await render("B");
		await waitFor(() => container.textContent === "2|2|2|2|2");
		await act(async () => {
			finishA.forEach((finish) => finish());
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
		expect(container.textContent).toBe("2|2|2|2|2");
		expect(fetchMock).toHaveBeenCalledTimes(10);
	});
});
