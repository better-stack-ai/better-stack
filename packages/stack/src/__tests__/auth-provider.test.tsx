// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComposedRoute } from "../client/components";
import {
	CanAccess,
	StackProvider,
	useCan,
	useIdentity,
	type StackAuthProvider,
} from "../context";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	vi.restoreAllMocks();
});

async function render(ui: React.ReactElement) {
	await act(async () => {
		root.render(ui);
	});
}

function provider(
	overrides: Partial<StackAuthProvider> = {},
): StackAuthProvider {
	return {
		getIdentity: () => ({ id: "user-1", name: "Test User" }),
		...overrides,
	};
}

function Providers({
	auth,
	router,
	children,
}: {
	auth?: StackAuthProvider;
	router?: { navigate?: (path: string) => void };
	children: React.ReactNode;
}) {
	return (
		<StackProvider basePath="/pages" auth={auth} router={router}>
			{children}
		</StackProvider>
	);
}

describe("useIdentity", () => {
	it("returns null identity and not pending without an auth provider", async () => {
		let captured: any;
		function Probe() {
			captured = useIdentity();
			return null;
		}
		await render(
			<Providers>
				<Probe />
			</Providers>,
		);

		expect(captured.identity).toBeNull();
		expect(captured.isPending).toBe(false);
	});

	it("resolves identity from the provider", async () => {
		let captured: any;
		function Probe() {
			captured = useIdentity();
			return null;
		}
		await render(
			<Providers auth={provider()}>
				<Probe />
			</Providers>,
		);

		expect(captured.identity).toEqual({ id: "user-1", name: "Test User" });
		expect(captured.isPending).toBe(false);
	});

	it("resolves to null identity when getIdentity throws", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let captured: any;
		function Probe() {
			captured = useIdentity();
			return null;
		}
		await render(
			<Providers
				auth={provider({
					getIdentity: () => Promise.reject(new Error("boom")),
				})}
			>
				<Probe />
			</Providers>,
		);

		expect(captured.identity).toBeNull();
		expect(captured.isPending).toBe(false);
	});
});

describe("useCan", () => {
	it("allows everything without an auth provider", async () => {
		let captured: any;
		function Probe() {
			captured = useCan({ resource: "blog:post", action: "delete" });
			return null;
		}
		await render(
			<Providers>
				<Probe />
			</Providers>,
		);

		expect(captured).toEqual({ can: true, isPending: false });
	});

	it("allows everything when the provider has no can()", async () => {
		let captured: any;
		function Probe() {
			captured = useCan({ resource: "blog:post", action: "delete" });
			return null;
		}
		await render(
			<Providers auth={provider()}>
				<Probe />
			</Providers>,
		);

		expect(captured).toEqual({ can: true, isPending: false });
	});

	it("passes the resolved identity and params to can()", async () => {
		const can = vi.fn().mockResolvedValue(true);
		let captured: any;
		function Probe() {
			captured = useCan({
				resource: "blog:post",
				action: "delete",
				params: { id: "p1" },
			});
			return null;
		}
		await render(
			<Providers auth={provider({ can })}>
				<Probe />
			</Providers>,
		);

		expect(can).toHaveBeenCalledWith({
			resource: "blog:post",
			action: "delete",
			params: { id: "p1" },
			identity: { id: "user-1", name: "Test User" },
		});
		expect(captured).toEqual({ can: true, isPending: false });
	});

	it("denies when can() resolves false", async () => {
		let captured: any;
		function Probe() {
			captured = useCan({ resource: "blog:post", action: "delete" });
			return null;
		}
		await render(
			<Providers auth={provider({ can: () => false })}>
				<Probe />
			</Providers>,
		);

		expect(captured).toEqual({ can: false, isPending: false });
	});

	it("denies when can() throws", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let captured: any;
		function Probe() {
			captured = useCan({ resource: "blog:post", action: "delete" });
			return null;
		}
		await render(
			<Providers
				auth={provider({ can: () => Promise.reject(new Error("boom")) })}
			>
				<Probe />
			</Providers>,
		);

		expect(captured).toEqual({ can: false, isPending: false });
	});
});

describe("CanAccess", () => {
	it("renders children without an auth provider", async () => {
		await render(
			<Providers>
				<CanAccess resource="blog:post" action="delete">
					<button type="button">Delete</button>
				</CanAccess>
			</Providers>,
		);

		expect(container.textContent).toBe("Delete");
	});

	it("renders children when can() allows", async () => {
		await render(
			<Providers auth={provider({ can: () => true })}>
				<CanAccess resource="blog:post" action="delete">
					<button type="button">Delete</button>
				</CanAccess>
			</Providers>,
		);

		expect(container.textContent).toBe("Delete");
	});

	it("hides children and renders fallback when can() denies", async () => {
		await render(
			<Providers auth={provider({ can: () => false })}>
				<CanAccess
					resource="blog:post"
					action="delete"
					fallback={<span>No access</span>}
				>
					<button type="button">Delete</button>
				</CanAccess>
			</Providers>,
		);

		expect(container.textContent).toBe("No access");
	});

	it("renders nothing by default when denied", async () => {
		await render(
			<Providers auth={provider({ can: () => false })}>
				<CanAccess resource="blog:post" action="delete">
					<button type="button">Delete</button>
				</CanAccess>
			</Providers>,
		);

		expect(container.textContent).toBe("");
	});

	it("renders the loading node while the check is pending", async () => {
		// A can() that never resolves keeps the check pending forever.
		const pending = new Promise<boolean>(() => {});
		await render(
			<Providers auth={provider({ can: () => pending })}>
				<CanAccess
					resource="blog:post"
					action="delete"
					loading={<span>Checking...</span>}
				>
					<button type="button">Delete</button>
				</CanAccess>
			</Providers>,
		);

		expect(container.textContent).toBe("Checking...");
	});
});

describe("SSR parity (no auth provider)", () => {
	it("renderToString output is unchanged by the auth wiring", () => {
		const html = renderToString(
			<StackProvider basePath="/pages">
				<CanAccess resource="x" action="read">
					<span>child</span>
				</CanAccess>
			</StackProvider>,
		);
		expect(html).toContain("child");
	});
});

describe("route gating (ComposedRoute permission)", () => {
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
				permission={{ resource: "blog:draft", action: "read" }}
			/>
		);
	}

	it("renders the page unchanged when no auth provider is configured", async () => {
		await render(
			<Providers>
				<GatedRoute />
			</Providers>,
		);

		expect(container.textContent).toBe("secret page");
	});

	it("renders the page when can() allows", async () => {
		await render(
			<Providers auth={provider({ can: () => true })}>
				<GatedRoute />
			</Providers>,
		);

		expect(container.textContent).toBe("secret page");
	});

	it("redirects unauthenticated users to loginPath via router.navigate", async () => {
		const navigate = vi.fn();
		await render(
			<Providers
				auth={provider({
					getIdentity: () => null,
					can: () => false,
					loginPath: "/login",
				})}
				router={{ navigate }}
			>
				<GatedRoute />
			</Providers>,
		);

		expect(navigate).toHaveBeenCalledWith("/login");
		// The gated page never renders while redirecting.
		expect(container.textContent).toBe("loading...");
	});

	it("throws into the route ErrorBoundary when an authenticated user is denied", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const navigate = vi.fn();
		await render(
			<Providers
				auth={provider({ can: () => false, loginPath: "/login" })}
				router={{ navigate }}
			>
				<GatedRoute />
			</Providers>,
		);

		expect(navigate).not.toHaveBeenCalled();
		expect(container.textContent).toBe("error page");
	});
});
