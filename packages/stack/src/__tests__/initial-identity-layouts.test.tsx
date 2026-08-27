import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNextLayout } from "../next/layout";
import { createReactRouterLayout } from "../react-router/layout";
import { createTanStackLayout } from "../tanstack/layout";

const nextHeaders = vi.hoisted(() =>
	vi.fn(async () => new Headers({ "x-user-id": "next-user" })),
);

vi.mock("next/headers", () => ({ headers: nextHeaders }));

describe("framework identity layout helpers", () => {
	beforeEach(() => {
		nextHeaders.mockClear();
	});

	it("creates a request-aware Next.js server layout around the full client subtree", async () => {
		const getIdentity = vi.fn(({ headers }: { headers: Headers }) => ({
			id: headers.get("x-user-id") ?? "missing",
		}));
		const layout = createNextLayout({
			auth: { getIdentity },
			ClientLayout: ({ initialIdentity, children }) => (
				<section data-user={initialIdentity?.id ?? "anonymous"}>
					{children}
				</section>
			),
		});

		const tree = await layout.Layout({ children: <span>sibling page</span> });
		const html = renderToString(tree);

		expect(html).toContain('data-user="next-user"');
		expect(html).toContain("sibling page");
		expect(nextHeaders).toHaveBeenCalledOnce();
		expect(getIdentity).toHaveBeenCalledOnce();
	});

	it("creates a React Router parent layout loader from the incoming request", async () => {
		const getIdentity = vi.fn((request: Request) => ({
			id: request.headers.get("x-user-id") ?? "missing",
		}));
		const layout = createReactRouterLayout({ auth: { getIdentity } });
		const request = new Request("http://test.local/pages/blog", {
			headers: { "x-user-id": "router-user" },
		});

		await expect(
			layout.loader({ request, params: {}, context: undefined }),
		).resolves.toEqual({ initialIdentity: { id: "router-user" } });
		expect(getIdentity).toHaveBeenCalledWith(request);
	});

	it("creates a TanStack parent route loader around a server identity function", async () => {
		const getInitialIdentity = vi.fn(async () => ({ id: "tanstack-user" }));
		const layout = createTanStackLayout({ getInitialIdentity });

		await expect(layout.loader()).resolves.toEqual({
			initialIdentity: { id: "tanstack-user" },
		});
		expect(getInitialIdentity).toHaveBeenCalledOnce();
	});
});
