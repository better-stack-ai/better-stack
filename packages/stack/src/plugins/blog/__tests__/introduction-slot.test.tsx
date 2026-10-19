import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "@workspace/ui/components/markdown-content";

describe("Markdown introduction slot", () => {
	it("follows the first top-level paragraph without splitting references or footnotes", () => {
		const html = renderToStaticMarkup(
			<MarkdownContent
				markdown={
					"# Title\n\n> Quoted paragraph\n\n- List paragraph\n\nIntroduction with [reference][profile] and a note[^1].\n\nSecond paragraph.\n\n[profile]: /compound\n[^1]: Footnote text."
				}
				afterFirstParagraph={<aside>Related profiles</aside>}
			/>,
		);
		expect(html).toContain('href="/compound"');
		expect(html).toContain("Footnote text.");
		expect(html.match(/Related profiles/g)).toHaveLength(1);
		expect(html).toMatch(
			/Introduction[\s\S]*<\/p><aside>Related profiles<\/aside>[\s\S]*Second paragraph/,
		);
		expect(html.indexOf("</blockquote>")).toBeLessThan(
			html.indexOf("Related profiles"),
		);
		expect(html.indexOf("</ul>")).toBeLessThan(
			html.indexOf("Related profiles"),
		);
	});

	it("omits the slot when there is no top-level paragraph", () => {
		const html = renderToStaticMarkup(
			<MarkdownContent
				markdown={"# Title\n\n- Item\n\n> Quote"}
				afterFirstParagraph={<aside>Related profiles</aside>}
			/>,
		);
		expect(html).not.toContain("Related profiles");
	});
});
