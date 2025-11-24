import { createStackClient } from "@btst/stack/client"
import { blogClientPlugin } from "@btst/stack/plugins/blog/client"
import { QueryClient } from "@tanstack/react-query"

// Get base URL function - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses import.meta.env.VITE_BASE_URL or falls back to window.location.origin
const getBaseURL = () => 
  typeof window !== 'undefined' 
    ? (import.meta.env.VITE_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:3000")

// Create the client library with plugins
export const getStackClient = (queryClient: QueryClient) => {
    const baseURL = getBaseURL()
    return createStackClient({
        plugins: {
            blog: blogClientPlugin({
                // Required config - provided once at plugin initialization
                apiBaseURL: baseURL,
                apiBasePath: "/api/data",
                siteBaseURL: baseURL,
                siteBasePath: "/pages",
                queryClient: queryClient,
                // Optional: SEO configuration
                seo: {
                    siteName: "Better Stack Blog",
                    author: "Better Stack Team",
                    twitterHandle: "@olliethedev",
                    locale: "en_US",
                    defaultImage: `${baseURL}/og-image.png`,
                },
                // Optional: hooks
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
                        console.error(
                            `[${context.isSSR ? 'SSR' : 'CSR'}] Load error:`,
                            error.message
                        );
                    }
                }
            })
        }
    })
}