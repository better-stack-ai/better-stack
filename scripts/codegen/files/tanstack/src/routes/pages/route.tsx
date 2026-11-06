import {
	NewsletterAction,
	BlogCampaignSource,
} from "@btst/plugin-newsletter/client/blog-integration";
import { StackProvider, type ClientStackOverrides } from "@btst/stack/context";
import { createTanStackLayout, tanstackRouter } from "@btst/stack/tanstack";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NotificationBell } from "@btst/plugin-notifications/client/components";
import { ChatLayout } from "@btst/plugin-ai-chat/client";
import { ProductImagesField } from "@btst/plugin-ecommerce/client/components";
import {
	SchoolLessonComments,
	KanbanTaskComments,
} from "@/components/resource-comments";
import { CommentThread } from "@btst/plugin-comments/client/components";
import { createMediaOverrides } from "@/components/media-overrides";
import {
	createMediaUploadConfig,
	uploadAsset,
} from "@btst/plugin-media/client";
import {
	MediaPicker,
	ImageInputField,
} from "@btst/plugin-media/client/components";
import { Button } from "../../components/ui/button";
import { resolveUser, searchUsers } from "../../lib/mock-users";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { clientAuth } from "../../lib/authorization.ui";
import { getInitialIdentity } from "../../lib/authorization.identity";
import { getStackClient } from "../../lib/stack-client";

const layout = createTanStackLayout({ getInitialIdentity });

export const Route = createFileRoute("/pages")({
	loader: layout.loader,
	component: Layout,
	notFoundComponent: () => {
		return <p>This page doesn't exist!</p>;
	},
});

function Layout() {
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	const routeContext = Route.useRouteContext();
	const { apiOrigin, initialIdentity, siteOrigin } = Route.useLoaderData();
	const stack = useMemo(
		() => getStackClient(routeContext.queryClient, { apiOrigin, siteOrigin }),
		[apiOrigin, routeContext.queryClient, siteOrigin],
	);
	const mediaOverrides = useMemo(() => createMediaOverrides(), [stack]);
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

	const overrides = useMemo<ClientStackOverrides<typeof stack>>(
		() => ({
			// Only genuinely plugin-specific overrides remain — the shared
			// router and resolved runtime come from the provider props above.
			newsletter: { CampaignSource: BlogCampaignSource },
			blog: {
				editPostAction: NewsletterAction,
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
				fieldComponents: { "ecommerce-images": ProductImagesField },
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
				taskDetailBottomSlot: (task) => <KanbanTaskComments task={task} />,
			},
			school: {
				imagePicker: mediaOverrides.imagePicker,
				imageInputField: mediaOverrides.imageInputField,
				uploadFile: mediaOverrides.uploadFile,
				lessonBottomSlot: (lesson) => <SchoolLessonComments lesson={lesson} />,
			},
			comments: {
				defaultCommentPageSize: 5,
				resourceLinks: {
					"blog-post": (slug) => `/pages/blog/${encodeURIComponent(slug)}`,
					"school-lesson": (id) => `/pages/learn/~${id}`,
					"kanban-task": (id) =>
						`/pages/kanban/${id.split("/")[0]}?task=${id.split("/")[1]}`,
				},
			},
		}),
		[mediaOverrides, uploadImage, uploadFileForChat],
	);

	return (
		<QueryClientProvider client={routeContext.queryClient}>
			<ReactQueryDevtools initialIsOpen={false} />
			<StackProvider
				stack={stack}
				router={tanstackRouter()}
				auth={clientAuth}
				initialIdentity={initialIdentity}
				overrides={overrides}
			>
				<mediaOverrides.UploadBinding />
				<div className="flex justify-end px-6 pt-4">
					<NotificationBell />
				</div>
				<div data-testid="hydration-update" data-hydrated={hydrated}>
					<Outlet />
				</div>
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
