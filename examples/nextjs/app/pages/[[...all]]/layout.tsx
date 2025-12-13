"use client"
import { BetterStackProvider } from "@btst/stack/context"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState } from "react"
import type { TodosPluginOverrides } from "@/lib/plugins/todo/client/overrides"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { BlogPluginOverrides } from "@btst/stack/plugins/blog/client"
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client"

// Get base URL - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses NEXT_PUBLIC_BASE_URL or falls back to window.location.origin (which will be correct)
const getBaseURL = () => 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:3000")

// Define the shape of all plugin overrides
type PluginOverrides = {
    todos: TodosPluginOverrides
    blog: BlogPluginOverrides,
    "ai-chat": AiChatPluginOverrides,
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
            <BetterStackProvider<PluginOverrides>
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
                        uploadImage: async (file) => {
                            console.log("uploadImage", file)
                            return "https://placehold.co/400/png"
                        },
                        Image: (props) => {
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
                        },
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
                        uploadImage: async (file) => {
                            console.log("uploadImage", file)
                            return "https://placehold.co/400/png"
                        },
                        Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
                        Image: (props) => {
                            const { alt = "", src = "", width, height, ...rest } = props
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
                        },
                        // Lifecycle hooks
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] AI Chat route:`, routeName, context.path);
                        },
                        onRouteError: async (routeName, error, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] AI Chat error:`, routeName, error.message);
                        },
                    }
                }}
            >
                {children}
            </BetterStackProvider>
        </QueryClientProvider>
    )
}

