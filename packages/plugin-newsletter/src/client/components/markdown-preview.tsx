"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function NewsletterMarkdownPreview({ markdown }: { markdown: string }) {
	return (
		<div className="markdown-content">
			<div className="markdown-inner">
				<div className="markdown-body">
					<ReactMarkdown skipHtml remarkPlugins={[remarkGfm]}>
						{markdown}
					</ReactMarkdown>
				</div>
			</div>
		</div>
	);
}
