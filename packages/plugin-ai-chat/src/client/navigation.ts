/** Perform a full-page navigation to a resolved cross-origin AI Chat page. */
export function navigateAiChatCrossOrigin(
	href: string,
	options: { replace?: boolean } = {},
): void {
	if (options.replace) {
		window.location.replace(href);
		return;
	}
	window.location.assign(href);
}
