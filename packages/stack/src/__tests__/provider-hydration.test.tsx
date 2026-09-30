// @vitest-environment jsdom
import {
	act,
	createContext,
	lazy,
	useContext,
	useEffect,
	useLayoutEffect,
	useState,
	type ReactNode,
	type ComponentType,
} from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import { createClientStack } from "../client";
import { ComposedRoute } from "../client/components/compose";
import { StackProvider, useStack } from "../context";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const permissions = definePermissions("records", {
	read: permission(z.object({ id: z.string() })),
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [permissions],
	rules: ({ records }) => [
		records.read.when(({ identity }) => identity?.id === "owner"),
	],
});
const auth = createClientAuth({ authorization, getIdentity: () => null });
const owner = { id: "owner" };
const access = permissions.read({ id: "one" });
const navigate = () => {};
const useRouter = () => undefinedRouter;
const undefinedRouter = {};
const onError = () => {};
const Content = () => <div data-content>Prefetched content</div>;
const Loading = () => <div data-loading>Loading</div>;
const ErrorPage = () => <div data-denied>Denied</div>;

function createStack() {
	return createClientStack({
		api: { baseURL: "http://test.local", basePath: "/api/data" },
		site: { baseURL: "http://test.local", basePath: "/pages" },
		queryClient: new QueryClient(),
		plugins: {},
	});
}

it.each([false, true])(
	"keeps pending page hydration safe when a provider rerenders (revoke: %s)",
	async (revoke) => {
		const stack = createStack();
		function Provider({ children }: { children: ReactNode }) {
			const [updated, setUpdated] = useState(false);
			useEffect(() => setUpdated(true), []);
			return (
				<StackProvider
					stack={stack}
					router={{ navigate, useRouter }}
					auth={auth}
					initialIdentity={updated && revoke ? null : owner}
				>
					<output>{updated ? "updated" : "initial"}</output>
					{children}
				</StackProvider>
			);
		}
		const tree = (Page: ComponentType) => (
			<Provider>
				<ComposedRoute
					path="/record/one"
					permission={access}
					PageComponent={Page}
					LoadingComponent={Loading}
					ErrorComponent={ErrorPage}
					onError={onError}
				/>
			</Provider>
		);
		const container = document.createElement("div");
		container.innerHTML = renderToString(tree(Content));
		expect(container.querySelector("[data-content]")).not.toBeNull();
		const Pending = lazy(
			() => new Promise<{ default: typeof Content }>(() => {}),
		);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const onRecoverableError = vi.fn();
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			await act(async () => {
				root = hydrateRoot(container, tree(Pending), { onRecoverableError });
			});
			expect(container.querySelector("output")?.textContent).toBe("updated");
			expect(container.querySelector("[data-content]") !== null).toBe(!revoke);
			expect(container.querySelector("[data-denied]") !== null).toBe(revoke);
			expect(container.querySelector("[data-loading]")).toBeNull();
			expect(onRecoverableError).not.toHaveBeenCalled();
		} finally {
			await act(async () => root?.unmount());
			stack.provider.queryClient.clear();
			consoleError.mockRestore();
			consoleWarn.mockRestore();
		}
	},
);

it("applies new router callbacks with the current host context before page effects", async () => {
	const Workspace = createContext("A");
	const stack = createStack();
	const observations: string[] = [];
	function Page() {
		const workspace = useContext(Workspace);
		const { router } = useStack();
		useLayoutEffect(() => {
			void router?.navigate?.(workspace);
		}, [workspace]);
		return null;
	}
	function App() {
		const [workspace, setWorkspace] = useState("A");
		useEffect(() => setWorkspace("B"), []);
		return (
			<Workspace.Provider value={workspace}>
				<StackProvider
					stack={stack}
					router={{
						navigate: (current) => {
							observations.push(`${current}:${workspace}`);
						},
					}}
				>
					<ComposedRoute
						path="/record"
						PageComponent={Page}
						LoadingComponent={Loading}
						onError={onError}
					/>
				</StackProvider>
			</Workspace.Provider>
		);
	}
	const root = createRoot(document.createElement("div"));
	try {
		await act(async () => root.render(<App />));
		expect(observations).toEqual(["A:A", "B:B"]);
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});
