"use client"
import React, { useState } from "react"
import { StackProvider } from "@btst/stack/context"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import type { TodosPluginOverrides } from "@/lib/plugins/todo/client/overrides"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { BlogPluginOverrides } from "@btst/stack/plugins/blog/client"
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client"
import { ChatLayout } from "@btst/stack/plugins/ai-chat/client"
import type { CMSPluginOverrides } from "@btst/stack/plugins/cms/client"
import type { FormBuilderPluginOverrides } from "@btst/stack/plugins/form-builder/client"
import type { UIBuilderPluginOverrides } from "@btst/stack/plugins/ui-builder/client"
import { defaultComponentRegistry } from "@btst/stack/plugins/ui-builder/client"
import type { KanbanPluginOverrides } from "@btst/stack/plugins/kanban/client"
import { resolveUser, searchUsers } from "@/lib/mock-users"

// Get base URL - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses NEXT_PUBLIC_BASE_URL or falls back to window.location.origin (which will be correct)
const getBaseURL = () => 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:3000")

// Mock file upload URLs
const MOCK_IMAGE_URL = "https://placehold.co/400/png"
const MOCK_FILE_URL = "https://example-files.online-convert.com/document/txt/example.txt"

// Mock file upload function that returns appropriate URL based on file type
async function mockUploadFile(file: File): Promise<string> {
    console.log("uploadFile", file.name, file.type)
    // Return image placeholder for images, txt file URL for other file types
    if (file.type.startsWith("image/")) {
        return MOCK_IMAGE_URL
    }
    return MOCK_FILE_URL
}

// Shared Next.js Image wrapper for plugins
// Handles both cases: with explicit dimensions or using fill mode
function NextImageWrapper(props: React.ImgHTMLAttributes<HTMLImageElement>) {
    const { alt = "", src = "", width, height, ...rest } = props
    
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
        )
    }
    
    return (
        <Image
            alt={alt}
            src={typeof src === "string" ? src : ""}
            width={width as number}
            height={height as number}
            {...rest}
        />
    )
}

// Define the shape of all plugin overrides
type PluginOverrides = {
    todos: TodosPluginOverrides
    blog: BlogPluginOverrides,
    "ai-chat": AiChatPluginOverrides,
    cms: CMSPluginOverrides,
    "form-builder": FormBuilderPluginOverrides,
    "ui-builder": UIBuilderPluginOverrides,
    kanban: KanbanPluginOverrides,
}

export default function ExampleLayout({
    children
}: {
    children: React.ReactNode
}) {
    const router = useRouter()
    // fresh instance to avoid stale client cache overriding hydrated data
    const [queryClient] = useState(() => getOrCreateQueryClient())
    const baseURL = getBaseURL()

    return (
        <QueryClientProvider client={queryClient}>
            <ReactQueryDevtools initialIsOpen={false} />
            <StackProvider<PluginOverrides>
                basePath="/pages"
                overrides={{
                    todos: {
                        Link: (props: React.ComponentProps<typeof Link>) => {
                            return <Link data-testid="link" {...props} />
                        },
                        navigate: (path) => router.push(path)
                    },
                    blog: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (path) => router.push(path),
                        refresh: () => router.refresh(),
                        uploadImage: mockUploadFile,
                        Image: NextImageWrapper,
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
                    },
                    "ai-chat": {
                        mode: "authenticated", // Full chat with conversation history
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (path) => router.push(path),
                        refresh: () => router.refresh(),
                        uploadFile: mockUploadFile,
                        Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
                        Image: NextImageWrapper,
                        // Lifecycle hooks
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] AI Chat route:`, routeName, context.path);
                        },
                        onRouteError: async (routeName, error, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] AI Chat error:`, routeName, error.message);
                        },
                    },
                    cms: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (path) => router.push(path),
                        refresh: () => router.refresh(),
                        uploadImage: mockUploadFile,
                        Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
                        Image: NextImageWrapper,
                        // Custom field components for CMS forms
                        // These override the default auto-form field types
                        fieldComponents: {
                            // Override "file" to use uploadImage from context
                            file: ({ field, label, isRequired, fieldConfigItem, fieldProps }) => {
                                const [preview, setPreview] = React.useState<string | null>(field.value || null);
                                const [uploading, setUploading] = React.useState(false);
                                // Sync preview with field.value when it changes (e.g., when editing an existing item)
                                React.useEffect(() => {
                                    const normalizedValue = field.value || null;
                                    if (normalizedValue !== preview) {
                                        setPreview(normalizedValue);
                                    }
                                }, [field.value, preview]);
                                return (
                                    <div className="space-y-2" data-testid="custom-file-field">
                                        <label className="text-sm font-medium">
                                            {label}
                                            {isRequired && <span className="text-destructive"> *</span>}
                                        </label>
                                        {!preview ? (
                                            <input
                                                type="file"
                                                accept="image/*"
                                                data-testid="image-upload-input"
                                                disabled={uploading}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        setUploading(true);
                                                        try {
                                                            const url = await mockUploadFile(file);
                                                            setPreview(url);
                                                            field.onChange(url);
                                                        } finally {
                                                            setUploading(false);
                                                        }
                                                    }
                                                }}
                                                className="block w-full text-sm"
                                            />
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <img src={preview} alt="Preview" className="h-16 w-16 object-cover rounded" data-testid="image-preview" />
                                                <button type="button" onClick={() => { setPreview(null); field.onChange(""); }} className="text-sm text-destructive" data-testid="remove-image-button">
                                                    Remove
                                                </button>
                                            </div>
                                        )}
                                        {fieldConfigItem?.description && (
                                            <p className="text-sm text-muted-foreground">{String(fieldConfigItem.description)}</p>
                                        )}
                                    </div>
                                );
                            },
                        },
                        // Lifecycle hooks
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] CMS route:`, routeName, context.path);
                        },
                        onRouteError: async (routeName, error, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] CMS error:`, routeName, error.message);
                        },
                    },
                    "form-builder": {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (path) => router.push(path),
                        refresh: () => router.refresh(),
                        Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
                        // Lifecycle hooks
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] Form Builder route:`, routeName, context.path);
                        },
                        onRouteError: async (routeName, error, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] Form Builder error:`, routeName, error.message);
                        },
                    },
                    "ui-builder": {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (path) => router.push(path),
                        refresh: () => router.refresh(),
                        Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
                        componentRegistry: defaultComponentRegistry,
                    },
                    kanban: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (path) => router.push(path),
                        refresh: () => router.refresh(),
                        Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
                        // User resolution for assignees
                        resolveUser,
                        searchUsers,
                        // Lifecycle hooks
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] Kanban route:`, routeName, context.path);
                        },
                        onRouteError: async (routeName, error, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] Kanban error:`, routeName, error.message);
                        },
                        onBeforeBoardsPageRendered: (context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onBeforeBoardsPageRendered`);
                            return true;
                        },
                        onBeforeBoardPageRendered: (boardId, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] onBeforeBoardPageRendered:`, boardId);
                            return true;
                        },
                    }
                }}
            >
                {children}
                {/* Floating AI chat widget — visible on all /pages/* routes for route-aware AI context */}
                <div
                    className="fixed bottom-6 right-6 z-50 w-[380px] shadow-xl"
                    data-testid="chat-widget"
                >
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
    )
}

