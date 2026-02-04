"use client"

import { useContentItemPopulated } from "@btst/stack/plugins/cms/client/hooks"
import { StackProvider } from "@btst/stack/context"
import { QueryClientProvider } from "@tanstack/react-query"
import { useRouter, useParams } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import type { CMSPluginOverrides } from "@btst/stack/plugins/cms/client"
import { getOrCreateQueryClient } from "@/lib/query-client"
import type { CMSTypes } from "@/lib/cms-schemas"
import { ArrowLeft, ExternalLink } from "lucide-react"

// Get base URL
const getBaseURL = () => 
    typeof window !== 'undefined' 
        ? (process.env.NEXT_PUBLIC_BASE_URL || window.location.origin)
        : (process.env.BASE_URL || "http://localhost:3000")

type PluginOverrides = {
    cms: CMSPluginOverrides,
}

function ResourceDetailContent({ id }: { id: string }) {
    // Fetch resource with populated relations
    const { item, isLoading, error } = useContentItemPopulated<CMSTypes, "resource">(
        "resource",
        id
    )
    
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-64">
                <div className="animate-pulse text-neutral-500">Loading resource...</div>
            </div>
        )
    }
    
    if (error || !item) {
        return (
            <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
                <div className="max-w-3xl mx-auto">
                    <Link 
                        href="/directory"
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-8"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Directory
                    </Link>
                    <div className="text-center py-12 text-red-500">
                        {error?.message || "Resource not found"}
                    </div>
                </div>
            </div>
        )
    }
    
    // Get the populated categories
    const categories = item._relations?.categoryIds || []

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
            {/* Header */}
            <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                <div className="max-w-3xl mx-auto px-6 py-8">
                    <Link 
                        href="/directory"
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Directory
                    </Link>
                    
                    <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                        {item.parsedData.name}
                    </h1>
                    
                    {/* Categories */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {categories.map(cat => {
                                const catData = cat.parsedData as { name: string; color?: string }
                                return (
                                    <Link
                                        key={cat.id}
                                        href={`/directory/category/${cat.id}`}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                                    >
                                        {catData.color && (
                                            <span 
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: catData.color }}
                                            />
                                        )}
                                        {catData.name}
                                    </Link>
                                )
                            })}
                        </div>
                    )}
                </div>
            </header>
            
            {/* Content */}
            <div className="max-w-3xl mx-auto px-6 py-8">
                {/* Description */}
                <div className="prose dark:prose-invert max-w-none mb-8">
                    <p className="text-lg text-neutral-700 dark:text-neutral-300">
                        {item.parsedData.description}
                    </p>
                </div>
                
                {/* Website Link */}
                {item.parsedData.website && (
                    <div className="mb-8">
                        <a
                            href={item.parsedData.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                        >
                            <ExternalLink className="w-4 h-4" />
                            Visit Website
                        </a>
                    </div>
                )}
                
                {/* Metadata */}
                <div className="border-t border-neutral-200 dark:border-neutral-800 pt-6">
                    <dl className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <dt className="text-neutral-500">Slug</dt>
                            <dd className="text-neutral-900 dark:text-neutral-100 font-mono">
                                {item.slug}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-neutral-500">Created</dt>
                            <dd className="text-neutral-900 dark:text-neutral-100">
                                {new Date(item.createdAt).toLocaleDateString()}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        </div>
    )
}

export default function ResourceDetailPage() {
    const router = useRouter()
    const params = useParams()
    const [queryClient] = useState(() => getOrCreateQueryClient())
    const baseURL = getBaseURL()
    
    const id = params.id as string

    return (
        <QueryClientProvider client={queryClient}>
            <StackProvider<PluginOverrides>
                basePath="/directory"
                overrides={{
                    cms: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (path) => router.push(path),
                        refresh: () => router.refresh(),
                        Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
                    }
                }}
            >
                <ResourceDetailContent id={id} />
            </StackProvider>
        </QueryClientProvider>
    )
}

