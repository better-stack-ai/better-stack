"use client";

import {
	useBasePath,
	usePluginOverrides,
	useStack,
	useTranslate,
} from "@btst/stack/context";
import { AddPostForm } from "../forms/post-forms";
import { PageHeader } from "../shared/page-header";
import { PageWrapper } from "../shared/page-wrapper";
import type { BlogPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import { useRef, useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import { createFillBlogFormHandler } from "./fill-blog-form-handler";

// Internal component with actual page content
export function NewPostPage() {
	const t = useTranslate();
	const overrides = usePluginOverrides<BlogPluginOverrides>("blog");
	const { localization } = overrides;
	const { router } = useStack();
	const navigate = router?.navigate;
	const basePath = useBasePath();

	// Call lifecycle hooks
	useRouteLifecycle({
		routeName: "newPost",
		context: {
			path: "/blog/new",
			isSSR: typeof window === "undefined",
		},
		overrides,
	});

	// Ref to capture the form instance from AddPostForm via onFormReady callback
	const formRef = useRef<UseFormReturn<any> | null>(null);
	const handleFormReady = useCallback((form: UseFormReturn<any>) => {
		formRef.current = form;
	}, []);

	// Register AI context so the chat can fill in the new post form
	useRegisterPageAIContext({
		routeName: "blog-new-post",
		pageDescription:
			"User is creating a new blog post in the admin editor. IMPORTANT: When asked to write, draft, or create a blog post, you MUST call the fillBlogForm tool to populate the form fields directly — do NOT just output the text in your response.",
		suggestions: [
			"Write a post about AI trends",
			"Draft an intro paragraph",
			"Suggest 5 tags for this post",
		],
		clientTools: {
			fillBlogForm: createFillBlogFormHandler(
				formRef,
				"Form filled successfully",
			),
		},
	});

	const handleClose = () => {
		void navigate?.(`${basePath}/blog`);
	};

	const handleSuccess = (post: { published: boolean }) => {
		// Navigate based on published status
		if (post.published) {
			void navigate?.(`${basePath}/blog`);
		} else {
			void navigate?.(`${basePath}/blog/drafts`);
		}
	};

	return (
		<PageWrapper className="gap-6" testId="new-post-page">
			<PageHeader
				title={
					localization?.BLOG_POST_ADD_TITLE ??
					t("blog.post.addTitle", "Add New Post")
				}
				description={
					localization?.BLOG_POST_ADD_DESCRIPTION ??
					t("blog.post.addDescription", "Create a new blog post.")
				}
			/>
			<AddPostForm
				onClose={handleClose}
				onSuccess={handleSuccess}
				onFormReady={handleFormReady}
			/>
		</PageWrapper>
	);
}
