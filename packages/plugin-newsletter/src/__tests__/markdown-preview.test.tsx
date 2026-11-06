import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NewsletterMarkdownPreview } from "../client/components/markdown-preview";

describe("newsletter Markdown preview", () => {
	it("drops executable HTML and unsafe URLs while retaining ordinary Markdown", () => {
		const html = renderToStaticMarkup(
			<NewsletterMarkdownPreview
				markdown={[
					"# Release notes",
					"",
					"[Read the update](https://example.com/releases)",
					"",
					"[Unsafe link](javascript:alert%281%29)",
					"",
					'<iframe srcdoc="<script>window.alert(1)</script>"></iframe>',
					"",
					"<script>window.alert(1)</script>",
					"",
					'<img src="x" onerror="window.alert(1)">',
					"",
					'<a href="https://example.com" onclick="window.alert(1)">Raw link</a>',
				].join("\n")}
			/>,
		);

		expect(html).toContain("<h1>Release notes</h1>");
		expect(html).toContain(
			'<a href="https://example.com/releases">Read the update</a>',
		);
		expect(html).not.toMatch(
			/<(?:iframe|script|img)\b|srcdoc=|onerror=|onclick=|href="javascript:/i,
		);
	});
});
