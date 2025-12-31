"use client"

import { 
    useContent, 
    useContentTypes 
} from "@btst/stack/plugins/cms/client/hooks"
import { BetterStackProvider } from "@btst/stack/context"
import { QueryClientProvider } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState, useMemo } from "react"
import Link from "next/link"
import type { CMSPluginOverrides } from "@btst/stack/plugins/cms/client"
import { getOrCreateQueryClient } from "@/lib/query-client"
import type { CMSTypes } from "@/lib/cms-schemas"

// Get base URL
const getBaseURL = () => 
    typeof window !== 'undefined' 
        ? (process.env.NEXT_PUBLIC_BASE_URL || window.location.origin)
        : (process.env.BASE_URL || "http://localhost:3000")

type PluginOverrides = {
    cms: CMSPluginOverrides,
}

function DirectoryContent() {
    const [search, setSearch] = useState("")
    
    // Fetch resources
    const { 
        items: resources, 
        isLoading: resourcesLoading, 
        error: resourcesError,
        total 
    } = useContent<CMSTypes, "resource">("resource", { limit: 50 })
    
    // Fetch categories for the filter sidebar
    const { 
        items: categories, 
        isLoading: categoriesLoading 
    } = useContent<CMSTypes, "category">("category", { limit: 50 })
    
    // Filter resources based on search
    const filteredResources = useMemo(() => {
        if (!search.trim()) return resources
        const query = search.toLowerCase()
        return resources.filter(r => 
            r.parsedData.name.toLowerCase().includes(query) ||
            r.parsedData.description?.toLowerCase().includes(query)
        )
    }, [resources, search])
    
    if (resourcesLoading || categoriesLoading) {
        return (
            <div className="flex items-center justify-center min-h-64">
                <div className="animate-pulse text-neutral-500">Loading directory...</div>
            </div>
        )
    }
    
    if (resourcesError) {
        return (
            <div className="p-8 text-center text-red-500">
                Error: {resourcesError.message}
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
            {/* Header */}
            <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                <div className="max-w-6xl mx-auto px-6 py-8">
                    <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
                        Resource Directory
                    </h1>
                    <p className="text-neutral-600 dark:text-neutral-400">
                        Explore {total} curated resources
                    </p>
                </div>
            </header>
            
            <div className="max-w-6xl mx-auto px-6 py-8">
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Sidebar - Categories */}
                    <aside className="lg:w-64 shrink-0">
                        <div className="sticky top-8">
                            <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4 uppercase tracking-wide">
                                Categories
                            </h2>
                            <div className="space-y-1">
                                {categories.map(cat => (
                                    <Link
                                        key={cat.id}
                                        href={`/directory/category/${cat.id}`}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                                    >
                                        {cat.parsedData.color && (
                                            <span 
                                                className="w-3 h-3 rounded-full shrink-0"
                                                style={{ backgroundColor: cat.parsedData.color }}
                                            />
                                        )}
                                        <span>{cat.parsedData.name}</span>
                                    </Link>
                                ))}
                                {categories.length === 0 && (
                                    <p className="text-sm text-neutral-500 px-3">No categories yet</p>
                                )}
                            </div>
                        </div>
                    </aside>
                    
                    {/* Main content */}
                    <main className="flex-1">
                        {/* Search */}
                        <div className="mb-6">
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search resources..."
                                className="w-full px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        
                        {/* Resource Grid */}
                        {filteredResources.length === 0 ? (
                            <div className="text-center py-12 text-neutral-500">
                                {search ? "No resources match your search" : "No resources yet. Create some in the CMS!"}
                            </div>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2">
                                {filteredResources.map(resource => (
                                    <Link
                                        key={resource.id}
                                        href={`/directory/${resource.id}`}
                                        className="block p-6 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-blue-500 dark:hover:border-blue-500 transition-colors group"
                                    >
                                        <h3 className="font-semibold text-lg text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {resource.parsedData.name}
                                        </h3>
                                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2 line-clamp-2">
                                            {resource.parsedData.description}
                                        </p>
                                        {resource.parsedData.website && (
                                            <p className="text-xs text-blue-500 mt-3 truncate">
                                                {resource.parsedData.website}
                                            </p>
                                        )}
                                        {/* Show category count */}
                                        {resource.parsedData.categoryIds && resource.parsedData.categoryIds.length > 0 && (
                                            <div className="mt-3 flex gap-1">
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                                    {resource.parsedData.categoryIds.length} categor{resource.parsedData.categoryIds.length === 1 ? 'y' : 'ies'}
                                                </span>
                                            </div>
                                        )}
                                    </Link>
                                ))}
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    )
}

export default function DirectoryPage() {
    const router = useRouter()
    const [queryClient] = useState(() => getOrCreateQueryClient())
    const baseURL = getBaseURL()

    return (
        <QueryClientProvider client={queryClient}>
            <BetterStackProvider<PluginOverrides>
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
                <DirectoryContent />
            </BetterStackProvider>
        </QueryClientProvider>
    )
}

