"use client";

import { useState, useCallback } from "react";
import { Button } from "@workspace/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetTrigger,
} from "@workspace/ui/components/sheet";
import { Menu, PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { ChatSidebar } from "./chat-sidebar";
import { ChatInterface } from "./chat-interface";

export interface ChatLayoutProps {
	/** API base URL */
	apiBaseURL: string;
	/** API base path */
	apiBasePath: string;
	/** Current conversation ID (if viewing existing conversation) */
	conversationId?: string;
	/** Layout mode: 'full' for full page with sidebar, 'widget' for embeddable widget */
	layout?: "full" | "widget";
	/** Additional class name for the container */
	className?: string;
	/** Whether to show the sidebar (default: true for full layout) */
	showSidebar?: boolean;
	/** Height of the widget (only applies to widget layout) */
	widgetHeight?: string | number;
}

/**
 * ChatLayout component that provides a full-page chat experience with sidebar
 * or a compact widget mode for embedding.
 */
export function ChatLayout({
	apiBaseURL,
	apiBasePath,
	conversationId,
	layout = "full",
	className,
	showSidebar = true,
	widgetHeight = "600px",
}: ChatLayoutProps) {
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	// Key to force ChatInterface remount when starting a new chat
	const [chatResetKey, setChatResetKey] = useState(0);

	const apiPath = `${apiBaseURL}${apiBasePath}/chat`;

	// Handler for "New chat" button - increments key to force remount
	const handleNewChat = useCallback(() => {
		// Only needed when we're already on the "new chat" route (/chat).
		// If we're on /chat/:id, navigation to /chat will remount ChatLayout/ChatInterface anyway.
		if (!conversationId) {
			setChatResetKey((prev) => prev + 1);
		}
	}, [conversationId]);

	if (layout === "widget") {
		return (
			<div
				className={cn(
					"flex flex-col w-full border rounded-xl overflow-hidden bg-background shadow-sm",
					className,
				)}
				style={{ height: widgetHeight }}
			>
				<ChatInterface apiPath={apiPath} id={conversationId} variant="widget" />
			</div>
		);
	}

	// Full layout with sidebar
	return (
		<div
			className={cn(
				"flex h-[calc(100vh-4rem)] w-full overflow-hidden",
				className,
			)}
			data-testid="chat-layout"
		>
			{/* Desktop Sidebar */}
			{showSidebar && (
				<div
					className={cn(
						"hidden md:flex transition-all duration-300 ease-in-out",
						sidebarOpen ? "w-72" : "w-0",
					)}
				>
					{sidebarOpen && (
						<ChatSidebar
							currentConversationId={conversationId}
							onNewChat={handleNewChat}
							className="w-72"
						/>
					)}
				</div>
			)}

			{/* Main Chat Area */}
			<div className="flex-1 flex flex-col min-w-0">
				{/* Header */}
				<div className="flex items-center gap-2 p-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
					{/* Mobile menu button */}
					{showSidebar && (
						<Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
							<SheetTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="md:hidden"
									aria-label="Open menu"
								>
									<Menu className="h-5 w-5" />
								</Button>
							</SheetTrigger>
							<SheetContent side="left" className="p-0 w-72">
								<ChatSidebar
									currentConversationId={conversationId}
									onNewChat={() => {
										handleNewChat();
										setMobileSidebarOpen(false);
									}}
								/>
							</SheetContent>
						</Sheet>
					)}

					{/* Desktop sidebar toggle */}
					{showSidebar && (
						<Button
							variant="ghost"
							size="icon"
							className="hidden md:flex"
							onClick={() => setSidebarOpen(!sidebarOpen)}
							aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
						>
							{sidebarOpen ? (
								<PanelLeftClose className="h-5 w-5" />
							) : (
								<PanelLeft className="h-5 w-5" />
							)}
						</Button>
					)}

					<div className="flex-1" />
				</div>

				<ChatInterface
					key={`chat-${conversationId ?? "new"}-${chatResetKey}`}
					apiPath={apiPath}
					id={conversationId}
					variant="full"
				/>
			</div>
		</div>
	);
}
