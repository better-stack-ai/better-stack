"use client";

import type { FallbackProps } from "react-error-boundary";
import { ErrorPlaceholder } from "./error-placeholder";
import { usePluginOverrides } from "@btst/stack/context";
import { BLOG_LOCALIZATION } from "../../localization";
import type { BlogPluginOverrides } from "../../overrides";

// Default error component for blog plugin routes
export function DefaultError({ error }: FallbackProps) {
	const { localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		localization: BLOG_LOCALIZATION,
	});
	const title = localization.BLOG_GENERIC_ERROR_TITLE;
	const message =
		process.env.NODE_ENV === "production"
			? localization.BLOG_GENERIC_ERROR_MESSAGE
			: (error?.message ?? localization.BLOG_GENERIC_ERROR_MESSAGE);
	return <ErrorPlaceholder title={title} message={message} />;
}
