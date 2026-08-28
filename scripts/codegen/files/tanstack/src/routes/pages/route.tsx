import { StackProvider } from "@btst/stack/context";
import { createTanStackLayout, tanstackRouter } from "@btst/stack/tanstack";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useCallback, useMemo } from "react";
import { ChatLayout } from "@btst/stack/plugins/ai-chat/client";
import { CommentThread } from "@btst/stack/plugins/comments/client/components";
import { uploadAsset } from "@btst/stack/plugins/media/client";
import {
	MediaPicker,
	ImageInputField,
} from "@btst/stack/plugins/media/client/components";
import { Button } from "../../components/ui/button";
import { resolveUser, searchUsers } from "../../lib/mock-users";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { defaultComponentRegistry } from "@btst/stack/plugins/ui-builder/client";
import { clientAuth } from "../../lib/authorization.ui";
import { getInitialIdentity } from "../../lib/authorization.identity";
import { getStackClient } from "../../lib/stack-client";

// Get base URL function - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses import.meta.env.VITE_BASE_URL or falls back to window.location.origin
const getBaseURL = () =>
	typeof window !== "undefined"
		? import.meta.env.VITE_BASE_URL || window.location.origin
		: process.env.BASE_URL || "http://localhost:3007";

const layout = createTanStackLayout({ getInitialIdentity });

export const Route = createFileRoute("/pages")({
	loader: layout.loader,
	component: Layout,
	notFoundComponent: () => {
		return <p>This page doesn't exist!</p>;
	},
});

function Layout() {
	const routeContext = Route.useRouteContext();
	const { initialIdentity } = Route.useLoaderData();
	const baseURL = getBaseURL();
	const stack = useMemo(
		() => getStackClient(routeContext.queryClient),
		[routeContext.queryClient],
	);
	const mediaClientConfig = useMemo(
		() => ({
			apiBaseURL: baseURL,
			apiBasePath: "/api/data",
			uploadMode: "direct" as const,
		}),
		[baseURL],
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
		<QueryClientProvider client={routeContext.queryClient}>
			<ReactQueryDevtools initialIsOpen={false} />
			<StackProvider
				stack={stack}
				router={tanstackRouter()}
				auth={clientAuth}
				initialIdentity={initialIdentity}
				overrides={{
					// Only genuinely plugin-specific overrides remain — the shared
					// Link/navigate/refresh and API wiring come from the top-level
					// `router` and `api` props above.
					"ui-builder": {
						componentRegistry: defaultComponentRegistry,
					},
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
					"ai-chat": {
						mode: "authenticated",
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
					media: {
						uploadMode: "direct",
						queryClient: routeContext.queryClient,
					},
				}}
			>
				<Outlet />
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
