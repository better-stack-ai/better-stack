"use client"

import { StackProvider } from "@btst/stack/context"
import { nextRouter } from "@btst/stack/next"
import { QueryClientProvider } from "@tanstack/react-query"
import { getOrCreateQueryClient } from "~/lib/query-client"
import { getStackClient } from "~/lib/stack-client"

export default function BtstPagesLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const queryClient = getOrCreateQueryClient()
	const stack = getStackClient(queryClient)
	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider
				stack={stack}
				router={nextRouter()}
			>
				{children}
			</StackProvider>
		</QueryClientProvider>
	)
}
