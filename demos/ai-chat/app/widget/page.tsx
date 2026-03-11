"use client";

import { useState } from "react";
import Link from "next/link";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { StackProvider } from "@btst/stack/context";
import { ChatLayout } from "@btst/stack/plugins/ai-chat/client";
import { PageAIContextProvider } from "@btst/stack/plugins/ai-chat/client/context";
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client";

type PluginOverrides = {
	"ai-chat": AiChatPluginOverrides;
};

const hasApiKey =
	typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_HAS_OPENAI_KEY;

const getBaseURL = () =>
	typeof window !== "undefined"
		? window.location.origin
		: "http://localhost:3000";

export default function WidgetPage() {
	const [queryClient] = useState(() => new QueryClient());
	const baseURL = getBaseURL();

	return (
		<QueryClientProvider client={queryClient}>
			<PageAIContextProvider>
				<StackProvider<PluginOverrides>
					basePath=""
					overrides={{
						"ai-chat": {
							apiBaseURL: baseURL,
							apiBasePath: "/api/data",
							mode: "public",
							navigate: () => {},
							chatSuggestions: [
								"What plugins does BTST offer?",
								"How do I install @btst/stack?",
								"Tell me about the blog plugin",
							],
						},
					}}
				>
					<div className="min-h-screen flex flex-col bg-background">
						{/* Nav */}
						<nav className="border-b bg-background sticky top-0 z-50">
							<div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
								<Link
									href="/"
									className="font-semibold text-lg hover:opacity-75 transition-opacity"
								>
									BTST AI Chat Demo
								</Link>
								<div className="flex items-center gap-4 text-sm">
									<Link
										href="/pages/chat"
										className="text-muted-foreground hover:text-foreground transition-colors"
									>
										Chat
									</Link>
									<Link
										href="/widget"
										className="text-foreground font-medium transition-colors"
									>
										Widget
									</Link>
									<a
										href="/api/data/reference"
										className="text-muted-foreground hover:text-foreground transition-colors"
									>
										API Docs
									</a>
									<Link
										href="/pages/route-docs"
										className="text-muted-foreground hover:text-foreground transition-colors"
									>
										Route Docs
									</Link>
								</div>
							</div>
						</nav>

						{!hasApiKey && (
							<div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800">
								Add <code className="font-mono">OPENAI_API_KEY</code> to{" "}
								<code className="font-mono">.env.local</code> to enable AI chat.
							</div>
						)}

						{/* Page content */}
						<main className="flex-1 max-w-5xl mx-auto w-full px-4 py-12 space-y-12">
							<div className="space-y-2">
								<h1 className="text-3xl font-bold tracking-tight">
									Widget Mode
								</h1>
								<p className="text-muted-foreground max-w-xl">
									The AI Chat plugin can be embedded as a floating widget on any
									page. Click the button in the bottom-right corner to open it.
								</p>
							</div>

							<div className="grid gap-6 sm:grid-cols-2">
								<div className="rounded-xl border p-6 space-y-2">
									<h2 className="font-semibold">Compact & embeddable</h2>
									<p className="text-sm text-muted-foreground">
										The widget renders as a fixed-position panel triggered by a
										floating button. It does not affect the surrounding page
										layout.
									</p>
								</div>
								<div className="rounded-xl border p-6 space-y-2">
									<h2 className="font-semibold">Configurable size</h2>
									<p className="text-sm text-muted-foreground">
										Pass <code className="font-mono text-xs">widgetHeight</code>{" "}
										and <code className="font-mono text-xs">widgetWidth</code>{" "}
										props to control the panel dimensions.
									</p>
								</div>
								<div className="rounded-xl border p-6 space-y-2">
									<h2 className="font-semibold">Page-aware context</h2>
									<p className="text-sm text-muted-foreground">
										Wrap your layout with{" "}
										<code className="font-mono text-xs">
											PageAIContextProvider
										</code>{" "}
										and call{" "}
										<code className="font-mono text-xs">
											useRegisterPageAIContext
										</code>{" "}
										on any page to give the AI awareness of the current view.
									</p>
								</div>
								<div className="rounded-xl border p-6 space-y-2">
									<h2 className="font-semibold">Stateless by default</h2>
									<p className="text-sm text-muted-foreground">
										In public mode the widget is stateless — no conversation
										history is persisted. Switch to{" "}
										<code className="font-mono text-xs">
											mode=&quot;authenticated&quot;
										</code>{" "}
										for persistent history.
									</p>
								</div>
							</div>

							<div className="rounded-xl border bg-muted/40 p-6 space-y-3">
								<h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
									Usage
								</h2>
								<pre className="text-sm overflow-x-auto bg-background rounded-lg border p-4">
									{`<ChatLayout
  apiBaseURL={baseURL}
  apiBasePath="/api/data"
  layout="widget"
  widgetHeight="520px"
  showSidebar={false}
/>`}
								</pre>
							</div>
						</main>

						{/* Floating widget */}
						<div className="fixed bottom-6 right-6 z-50">
							<ChatLayout
								apiBaseURL={baseURL}
								apiBasePath="/api/data"
								layout="widget"
								widgetHeight="520px"
								showSidebar={false}
							/>
						</div>
					</div>
				</StackProvider>
			</PageAIContextProvider>
		</QueryClientProvider>
	);
}
