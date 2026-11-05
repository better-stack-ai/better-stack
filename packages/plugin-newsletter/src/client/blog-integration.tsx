"use client";

import { useEffect, useRef } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { usePost } from "@btst/plugin-blog/client/hooks";
import { Button } from "@workspace/ui/components/button";
import { newsletterPermissions } from "../permissions";
import type { CampaignSourceProps } from "./overrides";

export function NewsletterAction({ slug }: { slug: string }) {
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

export function BlogCampaignSource({
	slug,
	postId,
	onLoad,
}: CampaignSourceProps) {
	const { post, error, isLoading } = usePost(slug);
	const loaded = useRef(false);
	useEffect(() => {
		if (post && post.id === postId && !loaded.current) {
			loaded.current = true;
			onLoad(post.title, post.content);
		}
	}, [post, postId, onLoad]);
	if (error)
		return (
			<p role="alert" className="text-sm text-destructive">
				The blog post could not be loaded. Check your access or write a new
				campaign.
			</p>
		);
	if (isLoading)
		return (
			<p role="status" className="text-sm">
				Loading blog post…
			</p>
		);
	if (!post || post.id !== postId)
		return (
			<p role="alert" className="text-sm text-destructive">
				The selected blog post was not found.
			</p>
		);
	return (
		<p className="text-sm text-muted-foreground">
			Started from “{post.title}”. Changes here do not change the blog post.
		</p>
	);
}
