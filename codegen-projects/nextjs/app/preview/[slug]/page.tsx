import PreviewPageClient from "./client"

/**
 * Server component that resolves params for React 18/19 compatibility.
 * In Next.js 15+, params is a Promise that must be awaited server-side.
 */
export default async function PreviewPage({
	params,
}: {
	params: Promise<{ slug: string }>
}) {
	const { slug } = await params
	return <PreviewPageClient slug={slug} />
}
