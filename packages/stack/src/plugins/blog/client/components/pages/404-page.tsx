"use client";

import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import { ErrorPlaceholder } from "../shared/error-placeholder";
import type { BlogPluginOverrides } from "../../overrides";
import { PageWrapper } from "../shared/page-wrapper";

export function NotFoundPage({ message }: { message: string }) {
	const t = useTranslate();
	const { localization } = usePluginOverrides<BlogPluginOverrides>("blog");
	const title =
		localization?.BLOG_PAGE_NOT_FOUND_TITLE ??
		t("blog.common.pageNotFoundTitle", "Not Found");
	const desc =
		message ||
		(localization?.BLOG_PAGE_NOT_FOUND_DESCRIPTION ??
			t(
				"blog.common.pageNotFoundDescription",
				"The page you are looking for does not exist.",
			));
	return (
		<PageWrapper testId="404-page">
			<ErrorPlaceholder title={title} message={desc} />
		</PageWrapper>
	);
}
