// @vitest-environment jsdom
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { act, Fragment, startTransition, StrictMode, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { ErrorBoundary } from "react-error-boundary";
import { StackProvider, useIdentity } from "@btst/stack/context";
import { blogClientPlugin } from "../client";
import { useApprovePost, useSuspenseEditorialPost } from "../client/hooks";
import { createBlogQueryKeys } from "../query-keys";
import { BLOG_QUERY_KEYS } from "../api/query-key-defs";
import { createIdentityTestAuth } from "./helpers/auth-test-utils";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function response(title: string) {
	return new Response(
		JSON.stringify({
			id: "post-1",
			slug: "same-post",
			title,
			editorial: { enabled: true, status: "submitted", version: 1 },
		}),
		{ headers: { "content-type": "application/json" } },
	);
}

async function waitFor(check: () => boolean) {
	const started = Date.now();
	while (!check()) {
		if (Date.now() - started > 3000) throw new Error("waitFor timed out");
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
	}
}

describe("Editorial private cache ownership", () => {
	let root: Root;
	let container: HTMLDivElement;
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

	it.each(["identity", "endpoint"] as const)(
		"isolates an account or service switch by %s and ignores old callbacks",
		async (change) => {
			const queryClient = new QueryClient({
				defaultOptions: { queries: { retry: false } },
			});
			const auth = createIdentityTestAuth(() => null);
			let finishApproval: ((response: Response) => void) | undefined;
			const approvalResponse = new Promise<Response>((resolve) => {
				finishApproval = resolve;
			});
			let finishRefetch: ((response: Response) => void) | undefined;
			const refetchResponse = new Promise<Response>((resolve) => {
				finishRefetch = resolve;
			});
			const fetch = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValueOnce(response("Private account A"))
				.mockReturnValueOnce(approvalResponse)
				.mockReturnValueOnce(refetchResponse)
				.mockResolvedValueOnce(response("Private account B"));
			const identityA = { id: "author-a" };
			const identityB = change === "identity" ? { id: "author-b" } : identityA;
			const endpointA = {
				baseURL: "https://app.example.com",
				basePath: "/api/a",
			};
			const endpointB =
				change === "endpoint"
					? { ...endpointA, basePath: "/api/b" }
					: endpointA;
			let approval: ReturnType<typeof useApprovePost> | undefined;
			let refetch:
				| ReturnType<typeof useSuspenseEditorialPost>["refetch"]
				| undefined;
			function Probe() {
				const result = useSuspenseEditorialPost("same-post");
				const { post } = result;
				refetch = result.refetch;
				approval = useApprovePost();
				return (
					<span>
						{post?.title}
						{approval.data?.title}
					</span>
				);
			}
			async function render(
				identity: { id: string },
				endpoint: typeof endpointA,
			) {
				const stack = createClientStack({
					api: endpoint,
					site: { baseURL: "https://app.example.com", basePath: "/pages" },
					queryClient,
					plugins: {
						blog: blogClientPlugin({
							editorialWorkflow: true,
							identityPartition: identity,
						}),
					},
				});
				await act(async () =>
					root.render(
						<StackProvider stack={stack} auth={auth} initialIdentity={identity}>
							<Suspense fallback={<span>loading</span>}>
								<Probe />
							</Suspense>
						</StackProvider>,
					),
				);
			}
			await render(identityA, endpointA);
			await waitFor(() => container.textContent === "Private account A");
			const oldRefetch = refetch;
			let pending: Promise<unknown> | undefined;
			await act(async () => {
				pending = approval?.mutateAsync({
					id: "post-1",
					expectedVersion: 1,
					expectedEditorialVersion: 1,
				});
				await Promise.resolve();
			});
			await waitFor(() => fetch.mock.calls.length === 2);
			let oldRefetchResult: Promise<unknown> | undefined;
			await act(async () => {
				oldRefetchResult = oldRefetch?.();
				await Promise.resolve();
			});
			await waitFor(() => fetch.mock.calls.length === 3);
			await render(identityB, endpointB);
			expect(container.textContent).not.toContain("Private account A");
			await waitFor(() => container.textContent === "Private account B");
			finishRefetch?.(response("Refreshed private account A"));
			await act(async () => {
				expect(await oldRefetchResult).toBeUndefined();
			});
			await act(async () => {
				await oldRefetch?.();
			});
			expect(fetch).toHaveBeenCalledTimes(4);
			expect(container.textContent).toBe("Private account B");
			finishApproval?.(response("Approved private account A"));
			await act(async () => {
				await pending;
			});
			expect(container.textContent).toBe("Private account B");
			expect(fetch).toHaveBeenCalledTimes(4);
			expect(
				queryClient.getQueryData(
					BLOG_QUERY_KEYS.editorialPostDetail("same-post", {
						identity: identityA,
						endpoint: endpointA,
					}),
				),
			).toBeUndefined();
			const currentEntry = queryClient
				.getQueryCache()
				.findAll({ queryKey: ["editorialPosts", "detail", "same-post"] })
				.find((query) => {
					const scope = query.queryKey[3] as {
						identity?: { id: string };
						endpoint: typeof endpointB;
					};
					return (
						scope.identity?.id === identityB.id &&
						scope.endpoint.basePath === endpointB.basePath
					);
				});
			expect((currentEntry?.state.data as { title: string })?.title).toBe(
				"Private account B",
			);
		},
	);
	it("refreshes only current-identity private history after an editorial decision", async () => {
		const queryClient = new QueryClient();
		const keys = createBlogQueryKeys(vi.fn());
		const oldKey = keys.postRevisions.list("post-1", {
			id: "old-reviewer",
		}).queryKey;
		const currentKey = keys.postRevisions.list("post-1", {
			id: "current-reviewer",
		}).queryKey;
		const history = { pages: [{ items: [], total: 0 }], pageParams: [0] };
		queryClient.setQueryData(oldKey, history);
		queryClient.setQueryData(currentKey, history);
		const oldFetch = vi.fn(async () => history);
		const currentFetch = vi.fn(async () => history);
		const stopOld = new QueryObserver(queryClient, {
			queryKey: oldKey,
			queryFn: oldFetch,
			staleTime: Infinity,
		}).subscribe(() => {});
		const stopCurrent = new QueryObserver(queryClient, {
			queryKey: currentKey,
			queryFn: currentFetch,
			staleTime: Infinity,
		}).subscribe(() => {});
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			response("Approved current content"),
		);
		const auth = createIdentityTestAuth(() => null);
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: { blog: blogClientPlugin({ editorialWorkflow: true }) },
		});
		let approve: ReturnType<typeof useApprovePost> | undefined;
		function Probe() {
			approve = useApprovePost();
			return null;
		}
		try {
			await act(async () =>
				root.render(
					<StackProvider
						stack={stack}
						auth={auth}
						initialIdentity={{ id: "current-reviewer" }}
					>
						<Probe />
					</StackProvider>,
				),
			);
			await act(async () => {
				await approve?.mutateAsync({
					id: "post-1",
					expectedVersion: 1,
					expectedEditorialVersion: 1,
				});
			});
			expect(oldFetch).not.toHaveBeenCalled();
			expect(currentFetch).toHaveBeenCalledOnce();
		} finally {
			stopOld();
			stopCurrent();
		}
	});
	it("preserves initial hydration and callback ownership for two endpoints sharing a query client", async () => {
		const queryClient = new QueryClient();
		const identity = { id: "same-author" };
		const auth = createIdentityTestAuth(() => identity);
		const endpointA = {
			baseURL: "https://app.example.com",
			basePath: "/api/a",
		};
		const endpointB = { ...endpointA, basePath: "/api/b" };
		for (const [endpoint, title] of [
			[endpointA, "Private A"],
			[endpointB, "Private B"],
		] as const)
			queryClient.setQueryData(
				BLOG_QUERY_KEYS.editorialPostDetail("same-post", {
					identity,
					endpoint,
				}),
				{
					id: "post-1",
					slug: "same-post",
					title,
					editorial: { enabled: true, status: "submitted", version: 1 },
				},
			);
		const createStack = (endpoint: typeof endpointA) =>
			createClientStack({
				api: endpoint,
				site: { baseURL: "https://app.example.com", basePath: "/pages" },
				queryClient,
				plugins: {
					blog: blogClientPlugin({
						editorialWorkflow: true,
						identityPartition: identity,
					}),
				},
			});
		const stackA = createStack(endpointA);
		const stackB = createStack(endpointB);
		const fetch = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async () => response("Updated A"));
		let approveA: ReturnType<typeof useApprovePost> | undefined;
		function Probe({ first }: { first?: boolean }) {
			const read = useSuspenseEditorialPost("same-post");
			const approve = useApprovePost();
			if (first) approveA = approve;
			return <span>{read.post?.title}</span>;
		}
		await act(async () =>
			root.render(
				<>
					<StackProvider stack={stackA} auth={auth} initialIdentity={identity}>
						<Suspense fallback="loading">
							<Probe first />
						</Suspense>
					</StackProvider>
					<StackProvider stack={stackB} auth={auth} initialIdentity={identity}>
						<Suspense fallback="loading">
							<Probe />
						</Suspense>
					</StackProvider>
				</>,
			),
		);
		expect(fetch).not.toHaveBeenCalled();
		expect(container.textContent).toBe("Private APrivate B");
		await act(async () => {
			await approveA?.mutateAsync({
				id: "post-1",
				expectedVersion: 1,
				expectedEditorialVersion: 1,
			});
		});
		await waitFor(() => container.textContent === "Updated APrivate B");
		expect(fetch).toHaveBeenCalledTimes(2);
		for (const [url] of fetch.mock.calls)
			expect(String(url)).toContain("/api/a/");
	});

	it.each([false, true])(
		"does not revive hydrated private content after same-identity authorization is refreshed and denied (StrictMode %s)",
		async (strict) => {
			const identity = { id: "same-author" };
			const endpoint = {
				baseURL: "https://app.example.com",
				basePath: "/api/editorial",
			};
			const queryClient = new QueryClient({
				defaultOptions: { queries: { retry: false } },
			});
			const initialKey = BLOG_QUERY_KEYS.editorialPostDetail("same-post", {
				identity,
				endpoint,
			});
			const privatePost = {
				id: "post-1",
				slug: "same-post",
				title: "Private cached title",
				content: "Previously authorized private body",
				editorial: { enabled: true, status: "draft", version: 1 },
			};
			queryClient.setQueryData(initialKey, privatePost);
			queryClient.setQueryData(["public-sentinel"], "unchanged");
			let resolveIdentity: ((identity: { id: string }) => void) | undefined;
			const auth = createIdentityTestAuth(
				() =>
					new Promise((resolve) => {
						resolveIdentity = resolve;
					}),
			);
			const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(
				async () =>
					new Response(JSON.stringify({ message: "Forbidden" }), {
						status: 403,
						headers: { "content-type": "application/json" },
					}),
			);
			vi.spyOn(console, "error").mockImplementation(() => {});
			const stack = createClientStack({
				api: endpoint,
				site: { baseURL: "https://app.example.com", basePath: "/pages" },
				queryClient,
				plugins: {
					blog: blogClientPlugin({
						editorialWorkflow: true,
						identityPartition: identity,
					}),
				},
			});
			let refreshIdentity:
				| ReturnType<typeof useIdentity>["refetch"]
				| undefined;
			let privateRead: ReturnType<typeof useSuspenseEditorialPost> | undefined;
			let approval: ReturnType<typeof useApprovePost> | undefined;
			const seen: string[] = [];
			function Controls() {
				refreshIdentity = useIdentity().refetch;
				return null;
			}
			function Probe() {
				privateRead = useSuspenseEditorialPost("same-post");
				seen.push(privateRead.post?.content ?? "");
				return <span>{privateRead.post?.content}</span>;
			}
			function Wrapper() {
				approval = useApprovePost();
				useSuspenseEditorialPost("same-post");
				return <Probe />;
			}
			const Mode = strict ? StrictMode : Fragment;
			await act(async () =>
				root.render(
					<Mode>
						<StackProvider stack={stack} auth={auth} initialIdentity={identity}>
							<Controls />
							<ErrorBoundary fallback={<span>Access denied</span>}>
								<Suspense fallback={<span>Resolving identity</span>}>
									<Wrapper />
								</Suspense>
							</ErrorBoundary>
						</StackProvider>
					</Mode>,
				),
			);
			expect(container.textContent).toBe(privatePost.content);
			expect(fetch).not.toHaveBeenCalled();
			const oldRead = privateRead!;
			const oldApproval = approval!;
			seen.length = 0;
			await act(async () => {
				startTransition(() => {
					void refreshIdentity?.();
				});
			});
			await act(async () => {
				expect(await oldRead.refetch()).toBeUndefined();
				await expect(
					oldApproval.mutateAsync({
						id: "post-1",
						expectedVersion: 1,
						expectedEditorialVersion: 1,
					}),
				).rejects.toThrow("Authorization changed");
			});
			expect(fetch).not.toHaveBeenCalled();
			await act(async () => {
				resolveIdentity?.(identity);
			});
			expect(container.textContent).not.toContain(privatePost.content);
			await waitFor(() => container.textContent === "Access denied");
			expect(fetch).toHaveBeenCalledTimes(1);
			expect(queryClient.getQueryData(initialKey)).toBeUndefined();
			expect(seen).not.toContain(privatePost.content);
			expect(queryClient.getQueryData(["public-sentinel"])).toBe("unchanged");
			await act(async () => {
				expect(await oldRead.refetch()).toBeUndefined();
			});
			expect(oldRead.isCurrentScope()).toBe(false);
			expect(fetch).toHaveBeenCalledTimes(1);
		},
	);
});
