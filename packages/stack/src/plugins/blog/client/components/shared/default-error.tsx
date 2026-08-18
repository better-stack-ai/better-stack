"use client";

import type { FallbackProps } from "react-error-boundary";
import { ErrorPlaceholder } from "./error-placeholder";
import { usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";

// Default error component for blog plugin routes
export function DefaultError({ error }: FallbackProps) {
	const t = useTranslate();
	const { localization } = usePluginOverrides<BlogPluginOverrides>("blog");
	const title =
		localization?.BLOG_GENERIC_ERROR_TITLE ??
		t("blog.common.genericErrorTitle", "Something went wrong");
	const genericMessage =
		localization?.BLOG_GENERIC_ERROR_MESSAGE ??
		t("blog.common.genericErrorMessage", "An unexpected error occurred.");
	const message =
		process.env.NODE_ENV === "production"
			? genericMessage
			: ((error instanceof Error ? error.message : undefined) ??
				genericMessage);
	return <ErrorPlaceholder title={title} message={message} />;
}
