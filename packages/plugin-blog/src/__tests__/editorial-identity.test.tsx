// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { blogClientPlugin } from "../client";
import { useApprovePost, useSuspenseEditorialPost } from "../client/hooks";
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
			const fetch = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValueOnce(response("Private account A"))
				.mockReturnValueOnce(approvalResponse)
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
			await render(identityB, endpointB);
			expect(container.textContent).not.toContain("Private account A");
			await waitFor(() => container.textContent === "Private account B");
			await act(async () => {
				await oldRefetch?.();
			});
			expect(fetch).toHaveBeenCalledTimes(3);
			expect(container.textContent).toBe("Private account B");
			finishApproval?.(response("Approved private account A"));
			await act(async () => {
				await pending;
			});
			expect(container.textContent).toBe("Private account B");
			expect(fetch).toHaveBeenCalledTimes(3);
			expect(
				queryClient.getQueryData(
					BLOG_QUERY_KEYS.editorialPostDetail("same-post", {
						identity: identityA,
						endpoint: endpointA,
					}),
				),
			).toBeUndefined();
			expect(
				queryClient.getQueryData<{ title: string }>(
					BLOG_QUERY_KEYS.editorialPostDetail("same-post", {
						identity: identityB,
						endpoint: endpointB,
					}),
				)?.title,
			).toBe("Private account B");
		},
	);
});
