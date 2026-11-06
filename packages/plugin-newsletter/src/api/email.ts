import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { CampaignRecord } from "../types";

export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

export function tokenUrl(base: string, path: string, token: string) {
	return `${base}/${path}?token=${token}`;
}
export function appendUnsubscribe(html: string, url: string) {
	return `${html}<hr><p style="font-size:12px;color:#666"><a href="${escapeHtml(url)}">Unsubscribe</a> from this mailing list.</p>`;
}
export function formatSender(name: string, email: string) {
	return `"${name.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" <${email}>`;
}

/** Render Markdown safely; raw HTML is an explicitly selected authoring format. */
export async function renderEmailBody(
	campaign: Pick<CampaignRecord, "body" | "format" | "previewText">,
): Promise<string> {
	const preheader = campaign.previewText
		? `<div style="display:none;max-height:0;overflow:hidden" aria-hidden="true">${escapeHtml(campaign.previewText)}</div>`
		: "";
	if (campaign.format === "html") return preheader + campaign.body;
	const stream = await renderToReadableStream(
		createElement(ReactMarkdown, {
			remarkPlugins: [remarkGfm],
			skipHtml: true,
			children: campaign.body,
		}),
	);
	await stream.allReady;
	return preheader + (await new Response(stream).text());
}

/** Replace only author-supplied HTTP(S) link destinations with opaque, stored link indexes. */
export function trackEmailLinks(html: string, base: string, token: string) {
	const links: string[] = [];
	const output = html.replace(
		/(<a\b[^>]*\bhref\s*=\s*)(["'])(.*?)\2/gi,
		(match, prefix: string, quote: string, destination: string) => {
			const decoded = destination
				.replaceAll("&amp;", "&")
				.replaceAll("&#x27;", "'")
				.replaceAll("&#39;", "'")
				.replaceAll("&quot;", '"');
			let url: URL;
			try {
				url = new URL(decoded);
			} catch {
				return match;
			}
			if (
				!["http:", "https:"].includes(url.protocol) ||
				url.username ||
				url.password
			)
				return match;
			const index = links.push(url.href) - 1;
			return `${prefix}${quote}${escapeHtml(`${tokenUrl(base, "track/click", token)}&link=${index}`)}${quote}`;
		},
	);
	return { html: output, links };
}
