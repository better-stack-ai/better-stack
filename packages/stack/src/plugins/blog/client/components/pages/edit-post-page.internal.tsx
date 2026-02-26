"use client";

import { useBasePath, usePluginOverrides } from "@btst/stack/context";
import { EditPostForm } from "../forms/post-forms";
import { PageHeader } from "../shared/page-header";
import { PageWrapper } from "../shared/page-wrapper";
import { BLOG_LOCALIZATION } from "../../localization";
import type { BlogPluginOverrides } from "../../overrides";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import { useRef, useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import { createFillBlogFormHandler } from "./fill-blog-form-handler";

// Internal component with actual page content
export function EditPostPage({ slug }: { slug: string }) {
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
		routeName: "editPost",
		context: {
			path: `/blog/${slug}/edit`,
			params: { slug },
			isSSR: typeof window === "undefined",
		},
		overrides,
		beforeRenderHook: (overrides, context) => {
			if (overrides.onBeforeEditPostPageRendered) {
				return overrides.onBeforeEditPostPageRendered(slug, context);
			}
			return true;
		},
	});

	// Ref to capture the form instance from EditPostForm via onFormReady callback
	const formRef = useRef<UseFormReturn<any> | null>(null);
	const handleFormReady = useCallback((form: UseFormReturn<any>) => {
		formRef.current = form;
	}, []);

	// Register AI context so the chat can fill in the edit form
	useRegisterPageAIContext({
		routeName: "blog-edit-post",
		pageDescription: `User is editing a blog post (slug: "${slug}") in the admin editor.`,
		suggestions: [
			"Improve this post's title",
			"Rewrite the intro paragraph",
			"Suggest better tags",
		],
		clientTools: {
			fillBlogForm: createFillBlogFormHandler(
				formRef,
				"Form updated successfully",
			),
		},
	});

	const handleClose = () => {
		navigate(`${basePath}/blog`);
	};

	const handleSuccess = (post: { slug: string; published: boolean }) => {
		// Navigate based on published status
		navigate(`${basePath}/blog/${post.slug}`);
	};

	const handleDelete = () => {
		// Navigate to blog list after deletion
		navigate(`${basePath}/blog`);
	};

	return (
		<PageWrapper className="gap-6" testId="edit-post-page">
			<PageHeader
				title={localization.BLOG_POST_EDIT_TITLE}
				description={localization.BLOG_POST_EDIT_DESCRIPTION}
			/>
			<EditPostForm
				postSlug={slug}
				onClose={handleClose}
				onSuccess={handleSuccess}
				onDelete={handleDelete}
				onFormReady={handleFormReady}
			/>
		</PageWrapper>
	);
}
