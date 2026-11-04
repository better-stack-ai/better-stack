// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	PageAIContextProvider,
	useRegisterPageAIContext,
	type PageAIContextConfig,
} from "../page-context";
import { usePageAIContext } from "../plugins/ai-chat/client/context/page-ai-context";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("core page context", () => {
	let container: HTMLDivElement;
	let root: Root;
	let activeContext: PageAIContextConfig | null;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
	});

	function Register({ config }: { config: PageAIContextConfig | null }) {
		useRegisterPageAIContext(config);
		return null;
	}

	function Read() {
		const context = usePageAIContext();
		activeContext = context;
		return <output>{context?.pageDescription ?? "No page context"}</output>;
	}

	it("shares core registrations with existing AI Chat consumers", async () => {
		await act(async () => {
			root.render(
				<PageAIContextProvider>
					<Register
						config={{ routeName: "blog-post", pageDescription: "A blog post" }}
					/>
					<Read />
				</PageAIContextProvider>,
			);
		});

		expect(container.textContent).toBe("A blog post");
	});

	it("keeps client tools current when their serializable page context is unchanged", async () => {
		const render = async (version: string) => {
			await act(async () => {
				root.render(
					<PageAIContextProvider>
						<Register
							config={{
								routeName: "blog-edit",
								pageDescription: "Editing a post",
								suggestions: ["Fill this form"],
								clientTools: {
									fillBlogForm: async ({ title }) => ({
										success: true,
										message: `${version}: ${title}`,
									}),
								},
							}}
						/>
						<Read />
					</PageAIContextProvider>,
				);
			});
		};

		await render("first");
		await render("updated");

		expect(activeContext?.suggestions).toEqual(["Fill this form"]);
		await expect(
			activeContext?.clientTools?.fillBlogForm?.({ title: "My post" }),
		).resolves.toEqual({ success: true, message: "updated: My post" });
	});

	it("clears registrations when a page disables context", async () => {
		const render = async (config: PageAIContextConfig | null) => {
			await act(async () => {
				root.render(
					<PageAIContextProvider>
						<Register config={config} />
						<Read />
					</PageAIContextProvider>,
				);
			});
		};
		await render({ routeName: "blog-post", pageDescription: "A blog post" });
		await render(null);

		expect(container.textContent).toBe("No page context");
	});

	it("allows pages to register without an AI context provider", async () => {
		await act(async () => {
			root.render(
				<>
					<Register
						config={{ routeName: "blog-post", pageDescription: "A blog post" }}
					/>
					<Read />
				</>,
			);
		});

		expect(container.textContent).toBe("No page context");
	});
});
