// app/routes/__root.tsx
import { useState, useEffect } from "react";
import { Outlet, Link, useNavigate } from "react-router";
import { BetterStackProvider } from "@btst/stack/context"
import type { BlogPluginOverrides } from "@btst/stack/plugins/blog/client"
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client"
import type { CMSPluginOverrides } from "@btst/stack/plugins/cms/client"

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
      cms: CMSPluginOverrides,
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
                    },
                    cms: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (href) => navigate(href),
                        uploadImage: mockUploadFile,
                        Link: ({ href, children, className, ...props }) => (
                            <Link to={href || ""} className={className} {...props}>
                              {children}
                            </Link>
                        ),
                        // Custom field components for CMS forms
                        // These override the default auto-form field types
                        fieldComponents: {
                            // Override "file" to use uploadImage from context
                            file: ({ field, label, isRequired, fieldConfigItem }) => {
                                const [preview, setPreview] = useState<string | null>(field.value || null);
                                const [uploading, setUploading] = useState(false);
                                // Sync preview with field.value when it changes (e.g., when editing an existing item)
                                useEffect(() => {
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
                        onRouteRender: async (routeName, context) => {
                            console.log(`[${context.isSSR ? 'SSR' : 'CSR'}] CMS route:`, routeName, context.path);
                        },
                    }
                }}
            >
                <Outlet />
            </BetterStackProvider>
            
  );
}
