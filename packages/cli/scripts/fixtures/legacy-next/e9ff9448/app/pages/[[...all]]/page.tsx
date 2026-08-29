import { createNextPage } from "@btst/stack/next"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"

export const dynamic = "force-dynamic"

const page = createNextPage({
	getStackClient: (queryClient) => getStackClient(queryClient),
	getQueryClient: getOrCreateQueryClient,
})
export default page.Page
export const generateMetadata = page.generateMetadata

