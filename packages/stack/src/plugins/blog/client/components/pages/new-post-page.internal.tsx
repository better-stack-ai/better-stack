"use client";

import { useBasePath, usePluginOverrides } from "@btst/stack/context";
import { AddPostForm } from "../forms/post-forms";
import { PageHeader } from "../shared/page-header";
import { PageWrapper } from "../shared/page-wrapper";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_LOCALIZATION } from "../../localization";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import { useRef, useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";

// Internal component with actual page content
export function NewPostPage() {
	const overrides = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		localization: BLOG_LOCALIZATION,
	});
	const { localization, navigate } = overrides;
	const basePath = useBasePath();

	// Call lifecycle hooks
	useRouteLifecycle({
		routeName: "newPost",
		context: {
			path: "/blog/new",
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (overrides, context) => {
			if (overrides.onBeforeNewPostPageRendered) {
				return overrides.onBeforeNewPostPageRendered(context);
			}
			return true;
		},
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
			fillBlogForm: async ({ title, content, excerpt, tags }) => {
				const form = formRef.current;
				if (!form) return { success: false, message: "Form not ready" };
				if (title !== undefined)
					form.setValue("title", title, { shouldValidate: true });
				if (content !== undefined)
					form.setValue("content", content, { shouldValidate: true });
				if (excerpt !== undefined) form.setValue("excerpt", excerpt);
				if (tags !== undefined)
					form.setValue(
						"tags",
						tags.map((name: string) => ({ name })),
					);
				return { success: true, message: "Form filled successfully" };
			},
		},
	});

	const handleClose = () => {
		navigate(`${basePath}/blog`);
	};

	const handleSuccess = (post: { published: boolean }) => {
		// Navigate based on published status
		if (post.published) {
			navigate(`${basePath}/blog`);
		} else {
			navigate(`${basePath}/blog/drafts`);
		}
	};

	return (
		<PageWrapper className="gap-6" testId="new-post-page">
			<PageHeader
				title={localization.BLOG_POST_ADD_TITLE}
				description={localization.BLOG_POST_ADD_DESCRIPTION}
			/>
			<AddPostForm
				onClose={handleClose}
				onSuccess={handleSuccess}
				onFormReady={handleFormReady}
			/>
		</PageWrapper>
	);
}
