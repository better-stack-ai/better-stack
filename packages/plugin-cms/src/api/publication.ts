import type { CMSPublicationPolicy, ContentItem } from "../types";

/** Whether a configured record belongs in a public content projection. */
export function isPublishedContent(
	item: Pick<ContentItem, "data" | "publishAt">,
	policy: CMSPublicationPolicy,
): boolean {
	if (item.publishAt) return false;
	return JSON.parse(item.data)[policy.stateField] === policy.publishedValue;
}
