"use client";

import {
	useBasePath,
	usePluginOverrides,
	useStack,
	usePluginSiteNavigation,
	PermissionAccess,
	useTranslate,
} from "@btst/stack/context";
import { EditPostForm } from "../forms/post-forms";
import { PageHeader } from "../shared/page-header";
import { PageWrapper } from "../shared/page-wrapper";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_PLUGIN_ID } from "../../constants";
import { useRouteLifecycle } from "@workspace/ui/hooks/use-route-lifecycle";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import { useRef, useCallback } from "react";
import type { UseFormReturn } from "react-hook-form";
import { createFillBlogFormHandler } from "./fill-blog-form-handler";
import { usePost } from "../../hooks";
import { newsletterPermissions } from "../../../../newsletter/permissions";
import { Button } from "@workspace/ui/components/button";

// Internal component with actual page content
export function EditPostPage({ slug }: { slug: string }) {
	const t = useTranslate();
	const overrides = usePluginOverrides<BlogPluginOverrides>(BLOG_PLUGIN_ID);
	const { localization } = overrides;
	const { router, plugins } = useStack();
	const navigate = router?.navigate;
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
		void navigate?.(`${basePath}/blog`);
	};

	const handleSuccess = (post: { slug: string; published: boolean }) => {
		// Navigate based on published status
		void navigate?.(`${basePath}/blog/${post.slug}`);
	};

	const handleDelete = () => {
		// Navigate to blog list after deletion
		void navigate?.(`${basePath}/blog`);
	};

	return (
		<PageWrapper className="gap-6" testId="edit-post-page">
			<PageHeader
				title={
					localization?.BLOG_POST_EDIT_TITLE ??
					t("blog.post.editTitle", "Edit Post")
				}
				description={
					localization?.BLOG_POST_EDIT_DESCRIPTION ??
					t("blog.post.editDescription", "Update your blog post.")
				}
			/>
			{plugins?.newsletter && <NewsletterAction slug={slug} />}
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

function NewsletterAction({ slug }: { slug: string }) {
	const { post } = usePost(slug);
	const { Link, resolve } = usePluginSiteNavigation("newsletter");
	if (!post) return null;
	const href = `${resolve("newsletter/campaigns/new").href}?${new URLSearchParams({ fromPostId: post.id, fromPostSlug: slug })}`;
	return (
		<PermissionAccess permission={newsletterPermissions.campaign.create()}>
			<Button asChild variant="outline">
				<Link href={href}>Send as newsletter</Link>
			</Button>
		</PermissionAccess>
	);
}
