"use client";
import React, { useState } from "react";
import { StackProvider } from "@btst/stack/context";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { TodosPluginOverrides } from "@/lib/plugins/todo/client/overrides";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { BlogPluginOverrides } from "@btst/stack/plugins/blog/client";
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client";
import { ChatLayout } from "@btst/stack/plugins/ai-chat/client";
import type { CMSPluginOverrides } from "@btst/stack/plugins/cms/client";
import type { FormBuilderPluginOverrides } from "@btst/stack/plugins/form-builder/client";
import type { UIBuilderPluginOverrides } from "@btst/stack/plugins/ui-builder/client";
import { defaultComponentRegistry } from "@btst/stack/plugins/ui-builder/client";
import type { KanbanPluginOverrides } from "@btst/stack/plugins/kanban/client";
import type { CommentsPluginOverrides } from "@btst/stack/plugins/comments/client";
import { CommentThread } from "@btst/stack/plugins/comments/client/components";
import {
	uploadAsset,
	type MediaPluginOverrides,
} from "@btst/stack/plugins/media/client";
import {
	MediaPicker,
	ImageInputField,
} from "@btst/stack/plugins/media/client/components";
import { resolveUser, searchUsers } from "@/lib/mock-users";
import { Button } from "@/components/ui/button";

// Get base URL - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses NEXT_PUBLIC_BASE_URL or falls back to window.location.origin (which will be correct)
const getBaseURL = () =>
	typeof window !== "undefined"
		? process.env.NEXT_PUBLIC_BASE_URL || window.location.origin
		: process.env.BASE_URL || "http://localhost:3000";

// Shared Next.js Image wrapper for plugins
// Handles both cases: with explicit dimensions or using fill mode
function NextImageWrapper(props: React.ImgHTMLAttributes<HTMLImageElement>) {
	const { alt = "", src = "", width, height, ...rest } = props;

	// Use fill mode if width or height are not provided
	if (!width || !height) {
		return (
			<span className="block relative w-full h-full">
				<Image
					alt={alt}
					src={typeof src === "string" ? src : ""}
					fill
					sizes="400px"
					{...rest}
				/>
			</span>
		);
	}

	return (
		<Image
			alt={alt}
			src={typeof src === "string" ? src : ""}
			width={width as number}
			height={height as number}
			{...rest}
		/>
	);
}

// Define the shape of all plugin overrides
type PluginOverrides = {
	todos: TodosPluginOverrides;
	blog: BlogPluginOverrides;
	"ai-chat": AiChatPluginOverrides;
	cms: CMSPluginOverrides;
	"form-builder": FormBuilderPluginOverrides;
	"ui-builder": UIBuilderPluginOverrides;
	kanban: KanbanPluginOverrides;
	comments: CommentsPluginOverrides;
	media: MediaPluginOverrides;
};

export default function ExampleLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	// fresh instance to avoid stale client cache overriding hydrated data
	const [queryClient] = useState(() => getOrCreateQueryClient());
	const baseURL = getBaseURL();
	const mediaClientConfig = React.useMemo(
		() => ({
			apiBaseURL: baseURL,
			apiBasePath: "/api/data",
			uploadMode: "direct" as const,
		}),
		[baseURL],
	);

	const uploadImage = React.useCallback(
		async (file: File) => {
			const asset = await uploadAsset(mediaClientConfig, { file });
			return asset.url;
		},
		[mediaClientConfig],
	);

	// For chat file attachments we embed as a data URL so OpenAI can read the
	// content directly — a local /uploads/... path is not reachable from OpenAI's servers.
	const uploadFileForChat = React.useCallback(
		(file: File): Promise<string> =>
			new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = (e) => resolve(e.target?.result as string);
				reader.onerror = () => reject(new Error("Failed to read file"));
				reader.readAsDataURL(file);
			}),
		[],
	);

	return (
		<QueryClientProvider client={queryClient}>
			<ReactQueryDevtools initialIsOpen={false} />
			<StackProvider<PluginOverrides>
				basePath="/pages"
				overrides={{
					todos: {
						Link: (props: React.ComponentProps<typeof Link>) => {
							return <Link data-testid="link" {...props} />;
						},
						navigate: (path) => router.push(path),
					},
					blog: {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						uploadImage,
						imagePicker: ImagePicker,
						imageInputField: ImageInputField,
						Image: NextImageWrapper,
						// Wire comments into the bottom of each blog post
						postBottomSlot: (post) => (
							<CommentThread
								resourceId={post.slug}
								resourceType="blog-post"
								apiBaseURL={baseURL}
								apiBasePath="/api/data"
								currentUserId="olliethedev" // In production: pass session?.user?.id
								headers={{ "x-user-id": "olliethedev" }} // In production: omit (cookies sent automatically)
								loginHref="/login"
								className="mt-8 pt-8 border-t"
							/>
						),
						// Lifecycle Hooks - called during route rendering
						onRouteRender: async (routeName, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onRouteRender: Route rendered:`,
								routeName,
								context.path,
							);
						},
						onRouteError: async (routeName, error, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onRouteError: Route error:`,
								routeName,
								error.message,
								context.path,
							);
						},
						onBeforePostsPageRendered: (context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onBeforePostsPageRendered: checking access for`,
								context.path,
							);
							return true;
						},
						onBeforeDraftsPageRendered: (context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onBeforeDraftsPageRendered: checking auth for`,
								context.path,
							);
							return true;
						},
						onBeforeNewPostPageRendered: (context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onBeforeNewPostPageRendered: checking permissions for`,
								context.path,
							);
							return true;
						},
						onBeforeEditPostPageRendered: (slug, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onBeforeEditPostPageRendered: checking permissions for`,
								slug,
								context.path,
							);
							return true;
						},
						onBeforePostPageRendered: (slug, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onBeforePostPageRendered: checking access for`,
								slug,
								context.path,
							);
							return true;
						},
					},
					"ai-chat": {
						mode: "authenticated", // Full chat with conversation history
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						uploadFile: uploadFileForChat,
						Link: ({ href, ...props }) => (
							<Link href={href || "#"} {...props} />
						),
						Image: NextImageWrapper,
						chatSuggestions: [
							"Hi, I'm Sarah, 34. I'm getting married next year and I just inherited $50,000 from my grandmother. I have no debt and about $30k in savings. I'm wondering if my current moderate-risk portfolio still makes sense.",
							"Hi, I run a small import business and want to invest $200,000. The money came from overseas sales across multiple countries over the past few months. I'd like to move it into Canadian equities right away.",
							"What information do I need to provide for a financial review?",
							"I'm approaching retirement in the next few years — what should I be thinking about?",
							"How is my risk tolerance assessed?",
						],
						// Lifecycle hooks
						onRouteRender: async (routeName, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] AI Chat route:`,
								routeName,
								context.path,
							);
						},
						onRouteError: async (routeName, error, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] AI Chat error:`,
								routeName,
								error.message,
							);
						},
					},
					cms: {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						uploadImage,
						imagePicker: ImagePicker,
						imageInputField: ImageInputField,
						Link: ({ href, ...props }) => (
							<Link href={href || "#"} {...props} />
						),
						Image: NextImageWrapper,
						// Lifecycle hooks
						onRouteRender: async (routeName, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] CMS route:`,
								routeName,
								context.path,
							);
						},
						onRouteError: async (routeName, error, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] CMS error:`,
								routeName,
								error.message,
							);
						},
					},
					"form-builder": {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						Link: ({ href, ...props }) => (
							<Link href={href || "#"} {...props} />
						),
						// Lifecycle hooks
						onRouteRender: async (routeName, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] Form Builder route:`,
								routeName,
								context.path,
							);
						},
						onRouteError: async (routeName, error, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] Form Builder error:`,
								routeName,
								error.message,
							);
						},
					},
					"ui-builder": {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						Link: ({ href, ...props }) => (
							<Link href={href || "#"} {...props} />
						),
						componentRegistry: defaultComponentRegistry,
					},
					kanban: {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						navigate: (path) => router.push(path),
						refresh: () => router.refresh(),
						Link: ({ href, ...props }) => (
							<Link href={href || "#"} {...props} />
						),

						uploadImage,
						imagePicker: ImagePicker,
						// User resolution for assignees
						resolveUser,
						searchUsers,
						// Wire comments into the bottom of each task detail dialog
						taskDetailBottomSlot: (task) => (
							<CommentThread
								resourceId={task.id}
								resourceType="kanban-task"
								apiBaseURL={baseURL}
								apiBasePath="/api/data"
								currentUserId="olliethedev" // In production: pass session?.user?.id
								headers={{ "x-user-id": "olliethedev" }} // In production: omit (cookies sent automatically)
								loginHref="/login"
							/>
						),
						// Lifecycle hooks
						onRouteRender: async (routeName, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] Kanban route:`,
								routeName,
								context.path,
							);
						},
						onRouteError: async (routeName, error, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] Kanban error:`,
								routeName,
								error.message,
							);
						},
						onBeforeBoardsPageRendered: (context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onBeforeBoardsPageRendered`,
							);
							return true;
						},
						onBeforeBoardPageRendered: (boardId, context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onBeforeBoardPageRendered:`,
								boardId,
							);
							return true;
						},
					},
					comments: {
						apiBaseURL: baseURL,
						apiBasePath: "/api/data",
						// In production: derive from your auth session
						currentUserId: "olliethedev",
						defaultCommentPageSize: 5,
						resourceLinks: {
							"blog-post": (slug) => `/pages/blog/${slug}`,
						},
						onBeforeModerationPageRendered: (context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onBeforeModerationPageRendered`,
							);
							return true; // In production: check admin role
						},
						onBeforeUserCommentsPageRendered: (context) => {
							console.log(
								`[${context.isSSR ? "SSR" : "CSR"}] onBeforeUserCommentsPageRendered`,
							);
							return true; // In production: check authenticated session
						},
					},
					media: {
						...mediaClientConfig,
						queryClient,
						navigate: (path) => router.push(path),
						Link: ({ href, ...props }) => (
							<Link href={href || "#"} {...props} />
						),
						Image: NextImageWrapper,
					},
				}}
			>
				{children}
				{/* Floating AI chat widget — visible on all /pages/* routes for route-aware AI context */}
				<div className="fixed bottom-6 right-6 z-50" data-testid="chat-widget">
					<ChatLayout
						apiBaseURL={getBaseURL()}
						apiBasePath="/api/data"
						layout="widget"
						widgetHeight="520px"
						showSidebar={false}
					/>
				</div>
			</StackProvider>
		</QueryClientProvider>
	);
}

const ImagePicker = ({ onSelect }: { onSelect: (url: string) => void }) => {
	return (
		<MediaPicker
			trigger={
				<Button variant="outline" size="sm" data-testid="open-media-picker">
					Browse Media
				</Button>
			}
			accept={["image/*"]}
			onSelect={(assets) => onSelect(assets[0]?.url ?? "")}
		/>
	);
};
