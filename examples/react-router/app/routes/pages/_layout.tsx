// app/routes/__root.tsx
import { Outlet, Link, useNavigate } from "react-router";
import { BetterStackProvider } from "@btst/stack/context"
import type { BlogPluginOverrides } from "@btst/stack/plugins/blog/client"
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client"

// Get base URL function - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses import.meta.env.VITE_BASE_URL or falls back to window.location.origin (which will be correct)
const getBaseURL = () => 
    typeof window !== 'undefined' 
      ? (import.meta.env.VITE_BASE_URL || window.location.origin)
      : (process.env.BASE_URL || "http://localhost:5173")

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

// Define the shape of all plugin overrides
  type PluginOverrides = {
      blog: BlogPluginOverrides,
      "ai-chat": AiChatPluginOverrides,
  }

export default function Layout() {
    
    const baseURL = getBaseURL()
    console.log("baseURL", baseURL)
    const navigate = useNavigate()
  return (
    
            <BetterStackProvider<PluginOverrides>
                basePath="/pages"
                overrides={{
                    blog: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => navigate(href),
                        uploadImage: mockUploadFile,
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
                    },
                    "ai-chat": {
                        mode: "authenticated",
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => navigate(href),
                        uploadFile: mockUploadFile,
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href || ""} className={className} {...props}>
                              {children}
                            </Link>
                        ),
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] AI Chat route:`, routeName, context.path);
                        },
                    }
                }}
            >
                <Outlet />
            </BetterStackProvider>
            
  );
}
