import { createStackClient } from "@btst/stack/client"
import { todosClientPlugin } from "@/lib/plugins/todo/client/client"
import { blogClientPlugin } from "@btst/stack/plugins/blog/client"
import { aiChatClientPlugin } from "@btst/stack/plugins/ai-chat/client"
import { cmsClientPlugin } from "@btst/stack/plugins/cms/client"
import { formBuilderClientPlugin } from "@btst/stack/plugins/form-builder/client"
import { uiBuilderClientPlugin, defaultComponentRegistry } from "@btst/stack/plugins/ui-builder/client"
import { routeDocsClientPlugin } from "@btst/stack/plugins/route-docs/client"
import { kanbanClientPlugin } from "@btst/stack/plugins/kanban/client"
import { QueryClient } from "@tanstack/react-query"

// Get base URL function - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses NEXT_PUBLIC_BASE_URL or falls back to window.location.origin
const getBaseURL = () => 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:3000")

// Create the client library with plugins
export const getStackClient = (
    queryClient: QueryClient,
    options?: { headers?: Headers }
) => {
    const baseURL = getBaseURL()
    return createStackClient({
        plugins: {
            todos: todosClientPlugin({
                queryClient: queryClient,
                apiBaseURL: baseURL,
                apiBasePath: "/api/data",
                siteBaseURL: baseURL,
                siteBasePath: "/pages",
            }),
            blog: blogClientPlugin({
                // Required config - provided once at plugin initialization
                apiBaseURL: baseURL,
                apiBasePath: "/api/data",
                siteBaseURL: baseURL,
                siteBasePath: "/pages",
                queryClient: queryClient,
                headers: options?.headers, // Pass headers for SSR auth
                // Optional: SEO configuration
                seo: {
                    siteName: "BTST Blog",
                    author: "BTST Team",
                    twitterHandle: "@olliethedev",
                    locale: "en_US",
                    defaultImage: `${baseURL}/og-image.png`,
                },
                hooks: {
                    
    
                    // Loader Hooks - called during data fetching (SSR or CSR)
                    beforeLoadPosts: async (filter, context) => {
                        
                        console.log(
                            `[${context.isSSR ? 'SSR' : 'CSR'}] beforeLoadPosts:`,
                            filter.published ? 'published' : 'drafts',
                            { filter }
                        );
                        return true;
                    },
                    afterLoadPosts: async (posts, filter, context) => {
                        console.log(
                            `[${context.isSSR ? 'SSR' : 'CSR'}] afterLoadPosts:`,
                            filter.published ? 'published' : 'drafts',
                            posts?.length || 0,
                            'posts loaded'
                        );
                        return true;
                    },
                    beforeLoadPost: async (slug, context) => {
                        console.log(
                            `[${context.isSSR ? 'SSR' : 'CSR'}] beforeLoadPost:`,
                            slug
                        );
                        return true;
                    },
                    afterLoadPost: async (post, slug, context) => {
                        console.log(
                            `[${context.isSSR ? 'SSR' : 'CSR'}] afterLoadPost:`,
                            slug,
                            post?.title || 'not found'
                        );
                        return true;
                    },
                    onLoadError: async (error, context) => {
                        console.log(
                            `[${context.isSSR ? 'SSR' : 'CSR'}] Load error:`,
                            error.message
                        );
                    },
                }
            }),
            // AI Chat plugin with authenticated mode (default)
            // For public chatbot without persistence, use mode: "public"
            aiChat: aiChatClientPlugin({
                apiBaseURL: baseURL,
                apiBasePath: "/api/data",
                siteBaseURL: baseURL,
                siteBasePath: "/pages",
                queryClient: queryClient,
                headers: options?.headers,
                mode: "authenticated", // Default: full chat with conversation history
                seo: {
                    siteName: "BTST Chat",
                    description: "AI-powered chat assistant",
                },
                hooks: {
                    beforeLoadConversations: async (context) => {
                        console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] beforeLoadConversations`);
                        return true;
                    },
                    afterLoadConversations: async (conversations, context) => {
                        console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] afterLoadConversations:`, conversations?.length || 0);
                        return true;
                    },
                },
            }),
            // CMS plugin for content management
            cms: cmsClientPlugin({
                apiBaseURL: baseURL,
                apiBasePath: "/api/data",
                siteBaseURL: baseURL,
                siteBasePath: "/pages",
                queryClient: queryClient,
                headers: options?.headers,
            }),
            // Form Builder plugin for dynamic forms
            "form-builder": formBuilderClientPlugin({
                apiBaseURL: baseURL,
                apiBasePath: "/api/data",
                siteBaseURL: baseURL,
                siteBasePath: "/pages",
                queryClient: queryClient,
                headers: options?.headers,
            }),
            // UI Builder plugin for visual page building
            "ui-builder": uiBuilderClientPlugin({
                apiBaseURL: baseURL,
                apiBasePath: "/api/data",
                siteBaseURL: baseURL,
                siteBasePath: "/pages",
                queryClient: queryClient,
                componentRegistry: defaultComponentRegistry,
                headers: options?.headers,
                hooks: {
                    beforeLoadPageList: async (context) => {
                        console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] beforeLoadPageList`);
                        return true;
                    },
                    beforeLoadPageBuilder: async (pageId, context) => {
                        console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] beforeLoadPageBuilder:`, pageId || 'new');
                        return true;
                    },
                },
            }),
            // Route Docs plugin for client route documentation
            routeDocs: routeDocsClientPlugin({
                queryClient: queryClient,
                title: "Client Route Documentation",
                description: "Documentation for all client routes in this application",
                siteBasePath: "/pages",
            }),
            // Kanban plugin for project management boards
            kanban: kanbanClientPlugin({
                apiBaseURL: baseURL,
                apiBasePath: "/api/data",
                siteBaseURL: baseURL,
                siteBasePath: "/pages",
                queryClient: queryClient,
                headers: options?.headers,
                seo: {
                    siteName: "BTST Kanban",
                    description: "Manage your projects with kanban boards",
                },
                hooks: {
                    beforeLoadBoards: async (context) => {
                        console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] beforeLoadBoards`);
                        return true;
                    },
                    afterLoadBoards: async (boards, context) => {
                        console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] afterLoadBoards:`, boards?.length || 0);
                        return true;
                    },
                },
            }),
        }
    })
}
