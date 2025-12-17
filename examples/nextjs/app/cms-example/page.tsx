"use client"

import { useContentTypes, useContent } from "@btst/stack/plugins/cms/client/hooks"
import { BetterStackProvider } from "@btst/stack/context"
import { QueryClientProvider } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import type { CMSPluginOverrides } from "@btst/stack/plugins/cms/client"
import { getOrCreateQueryClient } from "@/lib/query-client"
// Import the CMS type map for type-safe hooks
import type { CMSTypes } from "@/lib/cms-schemas"

// Get base URL - works on both server and client
const getBaseURL = () => 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:3000")

// Mock file upload function
async function mockUploadFile(file: File): Promise<string> {
    if (file.type.startsWith("image/")) {
        return "https://placehold.co/400/png"
    }
    return "https://example-files.online-convert.com/document/txt/example.txt"
}

// Shared Next.js Image wrapper
function NextImageWrapper(props: React.ImgHTMLAttributes<HTMLImageElement>) {
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
}

type PluginOverrides = {
    cms: CMSPluginOverrides,
}

function CMSExampleContent() {
    const { contentTypes, isLoading: typesLoading, error: typesError } = useContentTypes()
    // Type-safe hook: items[0].parsedData is now typed as ProductData
    // Try hovering over 'items' or 'parsedData' to see the inferred types!
    const { items, total, isLoading: itemsLoading, error: itemsError } = useContent<CMSTypes, "product">("product", { limit: 10 })

    if (typesLoading || itemsLoading) {
        return (
            <div data-testid="cms-loading" className="p-8 text-center">
                Loading CMS data...
            </div>
        )
    }

    if (typesError || itemsError) {
        return (
            <div data-testid="cms-error" className="p-8 text-center text-red-500">
                Error loading CMS data: {typesError?.message || itemsError?.message}
            </div>
        )
    }

    const hasContentTypes = contentTypes.length > 0
    const hasItems = items.length > 0

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-8" data-testid="cms-example-title">
                CMS Hooks Example
            </h1>

            {/* Content Types Section */}
            <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4">Content Types</h2>
                {!hasContentTypes ? (
                    <div data-testid="content-types-empty" className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
                        No content types found. Create content types in the CMS to see them here.
                    </div>
                ) : (
                    <div data-testid="content-types-list" className="space-y-2">
                        {contentTypes.map((type) => (
                            <div 
                                key={type.slug} 
                                data-testid={`content-type-${type.slug}`}
                                className="p-3 border rounded-lg flex justify-between items-center"
                            >
                                <span className="font-medium" data-testid="content-type-name">{type.name}</span>
                                <span className="text-sm text-gray-500" data-testid="content-type-count">
                                    {type.itemCount} items
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Product Items Section */}
            <section>
                <h2 className="text-xl font-semibold mb-4">Product Items (Total: <span data-testid="products-total">{total}</span>)</h2>
                {!hasItems ? (
                    <div data-testid="products-empty" className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
                        No products found. Create product items in the CMS to see them here.
                    </div>
                ) : (
                    <div data-testid="products-list" className="space-y-3">
                        {items.map((item) => (
                            <div 
                                key={item.id} 
                                data-testid={`product-item-${item.slug}`}
                                className="p-4 border rounded-lg"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        {/* No more type guards needed - parsedData is fully typed! */}
                                        <h3 className="font-medium" data-testid="product-name">
                                            {item.parsedData.name}
                                        </h3>
                                        <p className="text-sm text-gray-500" data-testid="product-slug">
                                            Slug: {item.slug}
                                        </p>
                                        {item.parsedData.description && (
                                            <p className="text-sm mt-1" data-testid="product-description">
                                                {item.parsedData.description}
                                            </p>
                                        )}
                                        {item.parsedData.featured && (
                                            <span className="inline-block mt-1 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                                                Featured
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <span className="text-lg font-semibold" data-testid="product-price">
                                            ${item.parsedData.price}
                                        </span>
                                        <p className="text-xs text-gray-500">
                                            {item.parsedData.category}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}

export default function CMSExamplePage() {
    const router = useRouter()
    const [queryClient] = useState(() => getOrCreateQueryClient())
    const baseURL = getBaseURL()

    return (
        <QueryClientProvider client={queryClient}>
            <BetterStackProvider<PluginOverrides>
                basePath="/cms-example"
                overrides={{
                    cms: {
                        apiBaseURL: baseURL,
                        apiBasePath: "/api/data",
                        navigate: (path) => router.push(path),
                        refresh: () => router.refresh(),
                        uploadImage: mockUploadFile,
                        Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
                        Image: NextImageWrapper,
                    }
                }}
            >
                <CMSExampleContent />
            </BetterStackProvider>
        </QueryClientProvider>
    )
}
