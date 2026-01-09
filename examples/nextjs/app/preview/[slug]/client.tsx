"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { QueryClientProvider } from "@tanstack/react-query"
import { BetterStackProvider } from "@btst/stack/context"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { PageRenderer, defaultComponentRegistry } from "@btst/stack/plugins/ui-builder/client"
import type { UIBuilderPluginOverrides } from "@btst/stack/plugins/ui-builder/client"
import Link from "next/link"

// Get base URL - works on both server and client
const getBaseURL = () => 
  typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_BASE_URL || window.location.origin)
    : (process.env.BASE_URL || "http://localhost:3000")

type PluginOverrides = {
  "ui-builder": UIBuilderPluginOverrides
}

interface PreviewPageClientProps {
  slug: string
}

/**
 * Client component for rendering UI Builder pages
 * Receives the resolved slug from the server component
 */
export default function PreviewPageClient({ slug }: PreviewPageClientProps) {
  const [queryClient] = useState(() => getOrCreateQueryClient())
  const router = useRouter()
  const baseURL = getBaseURL()

  return (
    <QueryClientProvider client={queryClient}>
      <BetterStackProvider<PluginOverrides>
        basePath="/preview"
        overrides={{
          "ui-builder": {
            apiBaseURL: baseURL,
            apiBasePath: "/api/data",
            componentRegistry: defaultComponentRegistry,
            navigate: (path) => router.push(path),
            refresh: () => router.refresh(),
            Link: ({ href, ...props }) => <Link href={href || "#"} {...props} />,
          }
        }}
      >
        <div className="min-h-screen">
          <PageRenderer
            slug={slug}
            componentRegistry={defaultComponentRegistry}
            className="w-full"
            NotFoundComponent={() => (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
                <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
                <p className="text-muted-foreground mb-4">
                  The page &ldquo;{slug}&rdquo; does not exist.
                </p>
                <Link 
                  href="/pages/ui-builder" 
                  className="text-primary hover:underline"
                >
                  Go to UI Builder
                </Link>
              </div>
            )}
            ErrorComponent={({ error }) => (
              <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
                <h1 className="text-2xl font-bold text-destructive mb-2">Error Loading Page</h1>
                <p className="text-muted-foreground mb-4">{error.message}</p>
                <Link 
                  href="/pages/ui-builder" 
                  className="text-primary hover:underline"
                >
                  Go to UI Builder
                </Link>
              </div>
            )}
          />
        </div>
      </BetterStackProvider>
    </QueryClientProvider>
  )
}
