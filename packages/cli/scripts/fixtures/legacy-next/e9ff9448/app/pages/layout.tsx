"use client"

import { StackProvider } from "@btst/stack/context"
import { nextRouter } from "@btst/stack/next"
import { ChatLayout } from "@btst/stack/plugins/ai-chat/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { usePathname } from "next/navigation"
import { getOrCreateQueryClient } from "@/lib/query-client"
import { getStackClient } from "@/lib/stack-client"

export default function BtstPagesLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const queryClient = getOrCreateQueryClient()
	const stack = getStackClient(queryClient)
	const hasApiKey = typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_HAS_OPENAI_KEY
	const pathname = usePathname()
	const showChatWidget = !pathname.startsWith("/pages/chat")
	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider
				stack={stack}
				router={nextRouter()}
				overrides={
					{
					"blog": {
						uploadImage: async () => {
							throw new Error("TODO: implement blog.uploadImage override in app/pages/layout.tsx")
						},
					},
					"kanban": {
						uploadImage: async () => {
							throw new Error("TODO: implement kanban.uploadImage override in app/pages/layout.tsx")
						},
						resolveUser: async () => null,
						searchUsers: async () => [],
					},
					}
				}
			>
				{!hasApiKey && (
					<div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800">
						Add <code className="font-mono">OPENAI_API_KEY</code> to{" "}
						<code className="font-mono">.env.local</code> to enable AI chat.
					</div>
				)}
				{children}
				{/* Floating AI chat widget — hidden on /pages/chat/* where the full UI is shown */}
				{showChatWidget && (
					<div className="fixed bottom-6 right-6 z-50">
						<ChatLayout
							layout="widget"
							widgetHeight="520px"
							showSidebar={false}
						/>
					</div>
				)}
			</StackProvider>
		</QueryClientProvider>
	)
}

