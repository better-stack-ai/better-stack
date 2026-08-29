"use client";
import React, { useState } from "react";
import { StackProvider } from "@btst/stack/context";
import { nextRouter } from "@btst/stack/next";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { getOrCreateQueryClient } from "@/lib/query-client";
import { getBrowserClientStack } from "@/lib/stack-client";
import { ChatLayout } from "@btst/stack/plugins/ai-chat/client";
import { CommentThread } from "@btst/stack/plugins/comments/client/components";
import {
	createMediaUploadConfig,
	uploadAsset,
} from "@btst/stack/plugins/media/client";
import {
	MediaPicker,
	ImageInputField,
} from "@btst/stack/plugins/media/client/components";
import { resolveUser, searchUsers } from "@/lib/mock-users";
import { Button } from "@/components/ui/button";
import { clientAuth } from "@/lib/authorization.client";

export function BtstPagesClientLayout({
	children,
	initialIdentity,
}: {
	children?: React.ReactNode;
	initialIdentity?: Awaited<ReturnType<typeof clientAuth.getIdentity>>;
}) {
	// fresh instance to avoid stale client cache overriding hydrated data
	const [queryClient] = useState(() => getOrCreateQueryClient());
	const stack = React.useMemo(
		() => getBrowserClientStack(queryClient),
		[queryClient],
	);
	const mediaClientConfig = React.useMemo(
		() => createMediaUploadConfig(stack.provider.plugins.media),
		[stack],
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
			<StackProvider
				stack={stack}
				router={nextRouter()}
				auth={clientAuth}
				initialIdentity={initialIdentity}
				overrides={{
					// Only genuinely plugin-specific overrides remain — the shared
					// router and resolved runtime come from the provider props above.
					blog: {
						uploadImage,
						imagePicker: ImagePicker,
						imageInputField: ImageInputField,
						// Wire comments into the bottom of each blog post
						postBottomSlot: (post) => (
							<CommentThread
								resourceId={post.slug}
								resourceType="blog-post"
								className="mt-8 pt-8 border-t"
							/>
						),
					},
					aiChat: {
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
					kanban: {
						uploadImage,
						imagePicker: ImagePicker,
						// User resolution for assignees
						resolveUser,
						searchUsers,
						// Wire comments into the bottom of each task detail dialog
						taskDetailBottomSlot: (task) => (
							<CommentThread resourceId={task.id} resourceType="kanban-task" />
						),
					},
					comments: {
						defaultCommentPageSize: 5,
						resourceLinks: {
							"blog-post": (slug) => `/pages/blog/${slug}`,
						},
					},
				}}
			>
				{children}
				{/* Floating AI chat widget — visible on all /pages/* routes for route-aware AI context */}
				<div className="fixed bottom-6 right-6 z-50" data-testid="chat-widget">
					<ChatLayout
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
