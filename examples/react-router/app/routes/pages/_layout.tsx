// app/routes/__root.tsx
import { useCallback, useMemo, useState } from "react";
import { Outlet, Link, useNavigate } from "react-router";
import { StackProvider } from "@btst/stack/context"
import type { BlogPluginOverrides } from "@btst/stack/plugins/blog/client"
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client"
import { ChatLayout } from "@btst/stack/plugins/ai-chat/client"
import type { CMSPluginOverrides } from "@btst/stack/plugins/cms/client"
import type { FormBuilderPluginOverrides } from "@btst/stack/plugins/form-builder/client"
import type { KanbanPluginOverrides } from "@btst/stack/plugins/kanban/client"
import type { CommentsPluginOverrides } from "@btst/stack/plugins/comments/client"
import { CommentThread } from "@btst/stack/plugins/comments/client/components"
import { uploadAsset, type MediaPluginOverrides } from "@btst/stack/plugins/media/client"
import { MediaPicker, ImageInputField } from "@btst/stack/plugins/media/client/components"
import { Button } from "../../components/ui/button"
import { resolveUser, searchUsers } from "../../lib/mock-users"
import { getOrCreateQueryClient } from "../../lib/query-client"

// Get base URL function - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses import.meta.env.VITE_BASE_URL or falls back to window.location.origin (which will be correct)
const getBaseURL = () => 
    typeof window !== 'undefined' 
      ? (import.meta.env.VITE_BASE_URL || window.location.origin)
      : (process.env.BASE_URL || "http://localhost:5173")


// Define the shape of all plugin overrides
  type PluginOverrides = {
      blog: BlogPluginOverrides,
      "ai-chat": AiChatPluginOverrides,
      cms: CMSPluginOverrides,
      "form-builder": FormBuilderPluginOverrides,
      kanban: KanbanPluginOverrides,
      comments: CommentsPluginOverrides,
      media: MediaPluginOverrides,
  }

export default function Layout() {
    
    const baseURL = getBaseURL()
    console.log("baseURL", baseURL)
    const navigate = useNavigate()
    const [queryClient] = useState(() => getOrCreateQueryClient())
    const mediaClientConfig = useMemo(
        () => ({
            apiBaseURL: baseURL,
            apiBasePath: "/api/data",
            uploadMode: "direct" as const,
        }),
        [baseURL],
    )

    const uploadImage = useCallback(async (file: File) => {
        const asset = await uploadAsset(mediaClientConfig, { file })
        return asset.url
    }, [mediaClientConfig])

    // For chat file attachments we embed as a data URL so OpenAI can read the
    // content directly — a local /uploads/... path is not reachable from OpenAI's servers.
    const uploadFileForChat = useCallback(
        (file: File): Promise<string> =>
            new Promise((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = (e) => resolve(e.target?.result as string)
                reader.onerror = () => reject(new Error("Failed to read file"))
                reader.readAsDataURL(file)
            }),
        [],
    )

  return (
    
            <StackProvider<PluginOverrides>
                basePath="/pages"
                overrides={{
                    blog: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => navigate(href),
                        uploadImage,
                        imagePicker: ImagePicker,
                        imageInputField: ImageInputField,
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href || ""} className={className} {...props}>
                              {children}
                            </Link>
                        ),
                        // Lifecycle Hooks - called during route rendering
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onRouteRender: Route rendered:`, routeName, context.path);
                        },
                        onRouteError: async (routeName, error, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onRouteError: Route error:`, routeName, error.message, context.path);
                        },
                        onBeforePostsPageRendered: (context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onBeforePostsPageRendered: checking access for`, context.path);
                            return true;
                        },
                        onBeforeDraftsPageRendered: (context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onBeforeDraftsPageRendered: checking auth for`, context.path);
                            return true;
                        },
                        onBeforeNewPostPageRendered: (context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onBeforeNewPostPageRendered: checking permissions for`, context.path);
                            return true;
                        },
                        onBeforeEditPostPageRendered: (slug, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onBeforeEditPostPageRendered: checking permissions for`, slug, context.path);
                            return true;
                        },
                        onBeforePostPageRendered: (slug, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onBeforePostPageRendered: checking access for`, slug, context.path);
                            return true;
                        },
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
                        mode: "authenticated",
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => navigate(href),
                        uploadFile: uploadFileForChat,
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href || ""} className={className} {...props}>
                              {children}
                            </Link>
                        ),
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] AI Chat route:`, routeName, context.path);
                        },
                    },
                    cms: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => navigate(href),
                        uploadImage,
                        imagePicker: ImagePicker,
                        imageInputField: ImageInputField,
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href || ""} className={className} {...props}>
                              {children}
                            </Link>
                        ),
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] CMS route:`, routeName, context.path);
                        },
                    },
                    "form-builder": {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => navigate(href),
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href || ""} className={className} {...props}>
                              {children}
                            </Link>
                        ),
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] Form Builder route:`, routeName, context.path);
                        },
                        onRouteError: async (routeName, error, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] Form Builder error:`, routeName, error.message);
                        },
                    },
                    kanban: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => navigate(href),
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href || ""} className={className} {...props}>
                              {children}
                            </Link>
                        ),
                        uploadImage,
                        imagePicker: ImagePicker,
                        // User resolution for assignees
                        resolveUser,
                        searchUsers,
                        // Wire comments into task detail dialogs
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
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] Kanban route:`, routeName, context.path);
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
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onBeforeModerationPageRendered`);
                            return true; // In production: check admin role
                        },
                        onBeforeUserCommentsPageRendered: (context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onBeforeUserCommentsPageRendered`);
                            return true; // In production: check authenticated session
                        },
                    },
                    media: {
                        ...mediaClientConfig,
                        queryClient,
                        navigate: (href) => navigate(href),
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href || ""} className={className} {...props}>
                              {children}
                            </Link>
                        ),
                    },
                }}
            >
                <Outlet />
                {/* Floating AI chat widget — visible on all /pages/* routes for route-aware AI context */}
                <div
                    className="fixed bottom-6 right-6 z-50"
                    data-testid="chat-widget"
                >
                    <ChatLayout
                        apiBaseURL={baseURL}
                        apiBasePath="/api/data"
                        layout="widget"
                        widgetHeight="520px"
                        showSidebar={false}
                    />
                </div>
            </StackProvider>
            
  );
}

const ImagePicker = ({ onSelect }: { onSelect: (url: string) => void }) => {
    return (
        <MediaPicker
            trigger={
                <Button
                    variant="outline"
                    size="sm"
                    data-testid="open-media-picker"
                >
                    Browse Media
                </Button>
            }
            accept={["image/*"]}
            onSelect={(assets) => onSelect(assets[0]?.url ?? "")}
        />
    )
}
