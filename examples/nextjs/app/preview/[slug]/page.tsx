import PreviewPageClient from "./client"

/**
 * Server component that handles params resolution for React 18/19 compatibility
 * In Next.js 15+, params is a Promise that needs to be awaited
 */
export default async function PreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params
  return <PreviewPageClient slug={resolvedParams.slug} />
}
