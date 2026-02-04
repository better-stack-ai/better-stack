import { 
    useContentItem, 
    useContentByRelation 
} from "@btst/stack/plugins/cms/client/hooks"
import { StackProvider } from "@btst/stack/context"
import { Link, useNavigate, useParams } from "react-router"
import type { CMSPluginOverrides } from "@btst/stack/plugins/cms/client"
import type { CMSTypes } from "../../lib/cms-schemas"
import { ArrowLeft } from "lucide-react"

// Get base URL
const getBaseURL = () => 
    typeof window !== 'undefined' 
        ? (import.meta.env.VITE_BASE_URL || window.location.origin)
        : (process.env.BASE_URL || "http://localhost:5173")

type PluginOverrides = {
    cms: CMSPluginOverrides,
}

function CategoryContent({ categoryId }: { categoryId: string }) {
    // Fetch the category
    const { item: category, isLoading: categoryLoading } = useContentItem<CMSTypes, "category">(
        "category",
        categoryId
    )
    
    // Fetch resources in this category
    const { 
        items: resources, 
        isLoading: resourcesLoading,
        total,
        hasMore,
        loadMore,
        isLoadingMore,
    } = useContentByRelation<CMSTypes, "resource">(
        "resource",
        "categoryIds",
        categoryId
    )
    
    if (categoryLoading || resourcesLoading) {
        return (
            <div className="flex items-center justify-center min-h-64">
                <div className="animate-pulse text-neutral-500">Loading category...</div>
            </div>
        )
    }
    
    if (!category) {
        return (
            <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
                <div className="max-w-4xl mx-auto">
                    <Link 
                        to="/directory"
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-8"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Directory
                    </Link>
                    <div className="text-center py-12 text-red-500">
                        Category not found
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
            {/* Header */}
            <header className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
                <div className="max-w-4xl mx-auto px-6 py-8">
                    <Link 
                        to="/directory"
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Directory
                    </Link>
                    
                    <div className="flex items-center gap-3">
                        {category.parsedData.color && (
                            <span 
                                className="w-6 h-6 rounded-full shrink-0"
                                style={{ backgroundColor: category.parsedData.color }}
                            />
                        )}
                        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100">
                            {category.parsedData.name}
                        </h1>
                    </div>
                    
                    {category.parsedData.description && (
                        <p className="text-neutral-600 dark:text-neutral-400 mt-2">
                            {category.parsedData.description}
                        </p>
                    )}
                    
                    <p className="text-sm text-neutral-500 mt-4">
                        {total} resource{total === 1 ? '' : 's'} in this category
                    </p>
                </div>
            </header>
            
            {/* Content */}
            <div className="max-w-4xl mx-auto px-6 py-8">
                {resources.length === 0 ? (
                    <div className="text-center py-12 text-neutral-500">
                        No resources in this category yet.
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {resources.map(resource => (
                                <Link
                                    key={resource.id}
                                    to={`/directory/${resource.id}`}
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
                                </Link>
                            ))}
                        </div>
                        
                        {hasMore && (
                            <div className="mt-6 text-center">
                                <button
                                    onClick={() => loadMore()}
                                    disabled={isLoadingMore}
                                    className="px-4 py-2 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50 transition-colors"
                                >
                                    {isLoadingMore ? "Loading..." : "Load More"}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

export default function CategoryPage() {
    const navigate = useNavigate()
    const params = useParams()
    const baseURL = getBaseURL()
    
    const categoryId = params.categoryId as string

    return (
        <StackProvider<PluginOverrides>
            basePath="/directory"
            overrides={{
                cms: {
                    apiBaseURL: baseURL,
                    apiBasePath: "/api/data",
                    navigate: (path) => navigate(path),
                    Link: ({ href, children, className, ...props }) => (
                        <Link to={href || ""} className={className} {...props}>
                            {children}
                        </Link>
                    ),
                }
            }}
        >
            <CategoryContent categoryId={categoryId} />
        </StackProvider>
    )
}

