"use client";
import React, { useState } from "react";
import { StackProvider } from "@btst/stack/context";
import { nextRouter } from "@btst/stack/next";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { TodosPluginOverrides } from "@/lib/plugins/todo/client/overrides";
import { getOrCreateQueryClient } from "@/lib/query-client";
import type { BlogPluginOverrides } from "@btst/stack/plugins/blog/client";
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
				router={nextRouter()}
				api={{ baseURL, basePath: "/api/data" }}
				overrides={{
					// Only genuinely plugin-specific overrides remain — the shared
					// Link/navigate/refresh/Image and API wiring come from the
					// top-level `router` and `api` props above.
					blog: {
						uploadImage,
						imagePicker: ImagePicker,
						imageInputField: ImageInputField,
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
					},
					"ai-chat": {
						mode: "authenticated", // Full chat with conversation history
						uploadFile: uploadFileForChat,
						chatSuggestions: [
							"Hi, I'm Sarah, 34. I'm getting married next year and I just inherited $50,000 from my grandmother. I have no debt and about $30k in savings. I'm wondering if my current moderate-risk portfolio still makes sense.",
							"Hi, I run a small import business and want to invest $200,000. The money came from overseas sales across multiple countries over the past few months. I'd like to move it into Canadian equities right away.",
							"What information do I need to provide for a financial review?",
							"I'm approaching retirement in the next few years — what should I be thinking about?",
							"How is my risk tolerance assessed?",
						],
					},
					cms: {
						uploadImage,
						imagePicker: ImagePicker,
						imageInputField: ImageInputField,
					},
					"ui-builder": {
						componentRegistry: defaultComponentRegistry,
					},
					kanban: {
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
					},
					comments: {
						// In production: derive from your auth session
						currentUserId: "olliethedev",
						defaultCommentPageSize: 5,
						resourceLinks: {
							"blog-post": (slug) => `/pages/blog/${slug}`,
						},
					},
					media: {
						...mediaClientConfig,
						queryClient,
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
