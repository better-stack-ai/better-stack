
import { BetterStackProvider } from "@btst/stack/context"
import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import type { BlogPluginOverrides } from "@btst/stack/plugins/blog/client"
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client"
import { Link, useRouter, Outlet, createFileRoute } from "@tanstack/react-router"

// Get base URL function - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses import.meta.env.VITE_BASE_URL or falls back to window.location.origin (which will be correct)
const getBaseURL = () => 
  typeof window !== 'undefined' 
    ? (import.meta.env.VITE_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:3000")

// Define the shape of all plugin overrides
type PluginOverrides = {
    blog: BlogPluginOverrides,
    "ai-chat": AiChatPluginOverrides,
}

export const Route = createFileRoute('/pages')({
    component: Layout,
    notFoundComponent: () => {
        return <p>This page doesn't exist!</p>
    }
})

function Layout() {
    const router = useRouter()
    const context = Route.useRouteContext()
    const baseURL = getBaseURL()

    return (
        <QueryClientProvider client={context.queryClient}>
            <ReactQueryDevtools initialIsOpen={false} />
            <BetterStackProvider<PluginOverrides>
                basePath="/pages"
                overrides={{
                    blog: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => router.navigate({ href }),
                        uploadImage: async (file) => {
                            console.log("uploadImage", file)
                            return "https://placehold.co/400/png"
                        },
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href} className={className} {...props}>
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
                    },
                    "ai-chat": {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => router.navigate({ href }),
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href} className={className} {...props}>
                              {children}
                            </Link>
                        ),
                    }
                }}
            >
                <Outlet />
            </BetterStackProvider>
        </QueryClientProvider>
    )
}

