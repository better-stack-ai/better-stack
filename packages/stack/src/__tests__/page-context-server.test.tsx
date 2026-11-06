import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import {
	PageAIContextProvider,
	usePageAIContext,
	useRegisterPageAIContext,
} from "../page-context";

it("imports and renders core page context during SSR without browser globals", () => {
	function Page() {
		useRegisterPageAIContext({
			routeName: "blog-post",
			pageDescription: "A blog post",
		});
		return <main>{usePageAIContext()?.pageDescription ?? "Server page"}</main>;
	}

	expect(
		renderToString(
			<PageAIContextProvider>
				<Page />
			</PageAIContextProvider>,
		),
	).toBe("<main>Server page</main>");
});
