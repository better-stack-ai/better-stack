// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, Component, Suspense, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createIdentityTestAuth } from "../../../__tests__/auth-test-utils";
import { createTestClientStack } from "../../../__tests__/client-stack-test-utils";
import {
	type UseConversationsResult,
	useConversations,
	useSuspenseConversations,
} from "../client/hooks/chat-hooks";
import { aiChatClientPlugin } from "../client/plugin";

function createAiChatStack(queryClient: QueryClient) {
	return createTestClientStack({ aiChat: aiChatClientPlugin() }, queryClient);
}

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

class ErrorBoundary extends Component<
	{ children: ReactNode },
	{ error?: Error }
> {
	state: { error?: Error } = {};

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	render() {
		return this.state.error ? this.state.error.message : this.props.children;
	}
}

describe("AI Chat identity-aware hooks", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		queryClient.clear();
		vi.restoreAllMocks();
	});

	it("surfaces pending and failed identity resolution without fetching history", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const identityError = new Error("identity unavailable");
		let rejectIdentity: ((error: Error) => void) | undefined;
		const auth = createIdentityTestAuth(
			() =>
				new Promise<null>((_resolve, reject) => {
					rejectIdentity = reject;
				}),
		);
		const fetchMock = vi.spyOn(globalThis, "fetch");
		let result: UseConversationsResult | undefined;

		function Probe() {
			result = useConversations();
			return null;
		}

		await act(async () => {
			root.render(
				<StackProvider stack={createAiChatStack(queryClient)} auth={auth}>
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>
				</StackProvider>,
			);
		});

		expect(result).toMatchObject({
			conversations: [],
			isLoading: true,
			error: null,
		});
		expect(fetchMock).not.toHaveBeenCalled();

		await act(async () => {
			rejectIdentity?.(identityError);
			await Promise.resolve();
		});

		expect(result).toMatchObject({
			conversations: [],
			isLoading: false,
			error: identityError,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps suspense history pending and then throws the identity error", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const identityError = new Error("suspense identity unavailable");
		let rejectIdentity: ((error: Error) => void) | undefined;
		const auth = createIdentityTestAuth(
			() =>
				new Promise<null>((_resolve, reject) => {
					rejectIdentity = reject;
				}),
		);
		const fetchMock = vi.spyOn(globalThis, "fetch");

		function Probe() {
			useSuspenseConversations();
			return "history";
		}

		await act(async () => {
			root.render(
				<StackProvider stack={createAiChatStack(queryClient)} auth={auth}>
					<QueryClientProvider client={queryClient}>
						<ErrorBoundary>
							<Suspense fallback="identity pending">
								<Probe />
							</Suspense>
						</ErrorBoundary>
					</QueryClientProvider>
				</StackProvider>,
			);
		});
		expect(container.textContent).toBe("identity pending");

		await act(async () => {
			rejectIdentity?.(identityError);
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(container.textContent).toBe(identityError.message);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
