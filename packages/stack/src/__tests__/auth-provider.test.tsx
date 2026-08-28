// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAuthorization } from "../authorization";
import { createClientAuth, type ClientAuth } from "../authorization/client";
import { ComposedRoute } from "../client/components";
import { StackProvider } from "../context";
import { blogPermissions } from "../plugins/blog/permissions";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [
		blog.post.read.when(({ identity }) => identity?.id === "allowed"),
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

function auth(
	identity: { id: string } | null,
	loginPath?: string,
): ClientAuth<typeof authorization> {
	return createClientAuth({
		authorization,
		getIdentity: () => identity,
		...(loginPath ? { loginPath } : {}),
	});
}

function Providers({
	auth: clientAuth,
	router,
	children,
}: {
	auth?: ClientAuth<typeof authorization>;
	router?: { navigate?: (path: string) => void };
	children: React.ReactNode;
}) {
	return (
		<StackProvider basePath="/pages" auth={clientAuth} router={router}>
			{children}
		</StackProvider>
	);
}

describe("descriptor route gating", () => {
	const Page = () => <div>secret page</div>;
	const Loading = () => <div>loading...</div>;
	const ErrorUi = () => <div>error page</div>;

	function GatedRoute() {
		return (
			<ComposedRoute
				path="/blog/drafts"
				PageComponent={Page}
				LoadingComponent={Loading}
				ErrorComponent={ErrorUi}
				onError={() => {}}
				permission={blogPermissions.post.read({ scope: "drafts" })}
			/>
		);
	}

	it("keeps browser presentation permissive when client auth is omitted", async () => {
		await render(
			<Providers>
				<GatedRoute />
			</Providers>,
		);
		expect(container.textContent).toBe("secret page");
	});

	it("evaluates the exact descriptor through createClientAuth", async () => {
		await render(
			<Providers auth={auth({ id: "allowed" })}>
				<GatedRoute />
			</Providers>,
		);
		expect(container.textContent).toBe("secret page");
	});

	it("redirects an anonymous denial to the bound login path", async () => {
		const navigate = vi.fn();
		await render(
			<Providers auth={auth(null, "/login")} router={{ navigate }}>
				<GatedRoute />
			</Providers>,
		);
		expect(navigate).toHaveBeenCalledWith("/login");
		expect(container.textContent).toBe("loading...");
	});

	it("sends an authenticated denial to the route error boundary", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const navigate = vi.fn();
		await render(
			<Providers auth={auth({ id: "denied" }, "/login")} router={{ navigate }}>
				<GatedRoute />
			</Providers>,
		);
		expect(navigate).not.toHaveBeenCalled();
		expect(container.textContent).toBe("error page");
	});
});
