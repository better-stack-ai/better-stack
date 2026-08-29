import { useCallback, useMemo } from "react";
import { Outlet, useLoaderData } from "react-router";
import { StackProvider } from "@btst/stack/context";
import { createReactRouterLayout, reactRouter } from "@btst/stack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
import { Button } from "../../components/ui/button";
import { resolveUser, searchUsers } from "../../lib/mock-users";
import { getStackClient } from "../../lib/stack-client";
import { clientAuth } from "../../lib/authorization.ui";
import { hydrationAuth } from "../../lib/authorization.server";

const layout = createReactRouterLayout({ auth: hydrationAuth });
export const loader = layout.loader;

export default function Layout() {
	const { initialIdentity, requestOrigin } = useLoaderData<typeof loader>();
	const queryClient = useQueryClient();
	const stack = useMemo(
		() => getStackClient(queryClient, { origin: requestOrigin }),
		[queryClient, requestOrigin],
	);
	const mediaClientConfig = useMemo(
		() => createMediaUploadConfig(stack.provider.plugins.media),
		[stack],
	);

	const uploadImage = useCallback(
		async (file: File) => {
			const asset = await uploadAsset(mediaClientConfig, { file });
			return asset.url;
		},
		[mediaClientConfig],
	);

	// For chat file attachments we embed as a data URL so OpenAI can read the
	// content directly — a local /uploads/... path is not reachable from OpenAI's servers.
	const uploadFileForChat = useCallback(
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
		<StackProvider
			stack={stack}
			router={reactRouter()}
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
				},
				cms: {
					uploadImage,
					imagePicker: ImagePicker,
					imageInputField: ImageInputField,
				},
				kanban: {
					uploadImage,
					imagePicker: ImagePicker,
					resolveUser,
					searchUsers,
					// Wire comments into task detail dialogs
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
			<Outlet />
			{/* Floating AI chat widget — visible on all /pages/* routes for route-aware AI context */}
			<div className="fixed bottom-6 right-6 z-50" data-testid="chat-widget">
				<ChatLayout layout="widget" widgetHeight="520px" showSidebar={false} />
			</div>
		</StackProvider>
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
