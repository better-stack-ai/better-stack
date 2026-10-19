// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "@workspace/ui/components/markdown-content";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function StatefulSlot({ label }: { label: string }) {
	const [count, setCount] = useState(0);
	return (
		<button onClick={() => setCount(count + 1)}>
			{label}: {count}
		</button>
	);
}

describe("Markdown introduction slot", () => {
	it("updates the introduction when slot props change without remounting", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		try {
			await act(async () => {
				root.render(
					<MarkdownContent
						markdown="Introduction."
						afterFirstParagraph={<StatefulSlot label="First selection" />}
					/>,
				);
			});
			expect(container.textContent).toContain("First selection: 0");
			const button = container.querySelector("button")!;
			await act(async () => button.click());
			button.focus();
			await act(async () => {
				root.render(
					<MarkdownContent
						markdown="Introduction."
						afterFirstParagraph={<StatefulSlot label="Updated selection" />}
					/>,
				);
			});
			expect(container.textContent).toContain("Updated selection: 1");
			expect(container.querySelector("button")).toBe(button);
			expect(document.activeElement).toBe(button);
			expect(container.textContent).not.toContain("First selection");
		} finally {
			await act(async () => root.unmount());
			container.remove();
		}
	});
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
