import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "@workspace/ui/components/markdown-content";

describe("markdown link navigation", () => {
	it("uses the supplied link component for body links and heading anchors", () => {
		const html = renderToStaticMarkup(
			<MarkdownContent
				markdown={
					"## Evidence\n\n[Profile](/compounds/one) and [Study](https://example.org/study)."
				}
				LinkComponent={(props) => (
					<a {...props} target="_blank" rel="noopener" />
				)}
			/>,
		);
		const anchors = html.match(/<a\b[^>]*>/g)!;
		expect(anchors).toHaveLength(3);
		for (const anchor of anchors) expect(anchor).toContain('target="_blank"');
		expect(html).toContain('href="#evidence"');
	});
	it("retains ordinary anchors when navigation is not overridden", () => {
		const html = renderToStaticMarkup(
			<MarkdownContent markdown={"## Evidence\n\n[Profile](/compounds/one)"} />,
		);
		expect(html).not.toContain('target="_blank"');
		expect(html).toContain('href="/compounds/one"');
	});
});
