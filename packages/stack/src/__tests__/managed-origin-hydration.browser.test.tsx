// @vitest-environment jsdom
import {
	dehydrate,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAuthorizationContract } from "../authorization";
import { createClientStack } from "../client";
import { StackProvider, useStack } from "../context";
import { createNextLayout } from "../next/server";
import { defineClientPlugin, defineRoute } from "../plugins/client";
import { createReactRouterPage } from "../react-router";
import { createTanStackPageOptions } from "../tanstack";

const frameworkState = vi.hoisted(() => ({
	queryClient: undefined as QueryClient | undefined,
	reactRouterLoaderData: undefined as unknown,
}));

vi.mock("next/headers", () => ({
	headers: async () => new Headers(),
}));

vi.mock("react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("react-router")>()),
	useLoaderData: () => frameworkState.reactRouterLoaderData,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useParams: () => ({ _splat: "probe" }),
	useRouteContext: () => ({ queryClient: frameworkState.queryClient }),
}));

const managedApiOrigin = "https://api.managed.example";
const siteOrigin = "https://app.example";
const browserFallbackOrigin = "https://app.example";

function OriginProbe() {
	return <span data-testid="runtime-origin">{useStack().api?.baseURL}</span>;
}

function createOriginStack(
	queryClient: QueryClient,
	apiOrigin: string,
	useProviderOrigin: boolean,
) {
	const PageComponent = useProviderOrigin
		? OriginProbe
		: () => <span data-testid="runtime-origin">{browserFallbackOrigin}</span>;
	return createClientStack({
		api: { baseURL: apiOrigin, basePath: "/api/data" },
		site: { baseURL: siteOrigin, basePath: "/pages" },
		queryClient,
		plugins: {
			probe: defineClientPlugin({
				id: "probe",
				resolve: () => ({
					routes: () => ({
						probe: defineRoute("/probe", { page: PageComponent }),
					}),
				}),
			}),
		},
	});
}

function renderManagedProvider(
	queryClient: QueryClient,
	stack: ReturnType<typeof createOriginStack>,
	children: ReactNode,
) {
	return renderToString(
		<QueryClientProvider client={queryClient}>
			<StackProvider stack={stack}>{children}</StackProvider>
		</QueryClientProvider>,
	);
}

describe("managed API origin hydration", () => {
	it("threads the distinct server origin through the Next client provider", async () => {
		const queryClient = new QueryClient();
		const contract = defineAuthorizationContract({
			identity: z.object({ id: z.string() }),
			permissions: [] as const,
		});
		const layout = createNextLayout({
			auth: { contract, getIdentityFromHeaders: () => null },
			resolveClientOrigins: () => ({
				apiOrigin: managedApiOrigin,
				siteOrigin,
			}),
			ClientLayout: ({ children, clientOrigins }) => {
				if (!clientOrigins) throw new Error("Expected hydrated client origins");
				const stack = createOriginStack(
					queryClient,
					clientOrigins.apiOrigin,
					true,
				);
				return (
					<QueryClientProvider client={queryClient}>
						<StackProvider stack={stack}>
							<OriginProbe />
							{children}
						</StackProvider>
					</QueryClientProvider>
				);
			},
		});

		const html = renderToString(await layout.Layout({}));

		expect(html).toContain(managedApiOrigin);
		expect(html).not.toContain(`>${browserFallbackOrigin}<`);
	});

	it.each(["React Router", "TanStack Start"])(
		"keeps the provider stack during %s hydration and navigation renders",
		(framework) => {
			const queryClient = new QueryClient();
			frameworkState.queryClient = queryClient;
			frameworkState.reactRouterLoaderData = {
				path: "/probe",
				dehydratedState: dehydrate(queryClient),
			};
			const providerStack = createOriginStack(
				queryClient,
				managedApiOrigin,
				true,
			);
			const browserFallbackStack = createOriginStack(
				queryClient,
				browserFallbackOrigin,
				false,
			);
			const getBrowserFallbackStack = vi.fn(() => browserFallbackStack);
			const Component =
				framework === "React Router"
					? createReactRouterPage({
							getStackClient: getBrowserFallbackStack,
							getQueryClient: () => queryClient,
						}).Component
					: createTanStackPageOptions({
							getStackClient: getBrowserFallbackStack,
							getQueryClient: () => queryClient,
						}).component;

			const html = renderManagedProvider(
				queryClient,
				providerStack,
				<Component />,
			);

			expect(html).toContain(managedApiOrigin);
			expect(html).not.toContain(browserFallbackOrigin);
			expect(getBrowserFallbackStack).not.toHaveBeenCalled();
		},
	);
});
