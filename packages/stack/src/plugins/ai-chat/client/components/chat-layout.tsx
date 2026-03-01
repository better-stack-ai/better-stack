"use client";

import { useState, useCallback } from "react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
	Sheet,
	SheetContent,
	SheetTrigger,
} from "@workspace/ui/components/sheet";
import {
	Menu,
	PanelLeftClose,
	PanelLeft,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { ChatSidebar } from "./chat-sidebar";
import { ChatInterface } from "./chat-interface";
import type { UIMessage } from "ai";
import { usePageAIContext } from "../context/page-ai-context";

interface ChatLayoutBaseProps {
	/** API base URL */
	apiBaseURL: string;
	/** API base path */
	apiBasePath: string;
	/** Current conversation ID (if viewing existing conversation) */
	conversationId?: string;
	/** Additional class name for the container */
	className?: string;
	/** Whether to show the sidebar */
	showSidebar?: boolean;
	/** Initial messages to populate the chat (useful for localStorage persistence in public mode) */
	initialMessages?: UIMessage[];
	/** Called whenever messages change (for persistence). Only fires in public mode. */
	onMessagesChange?: (messages: UIMessage[]) => void;
}

interface ChatLayoutWidgetProps extends ChatLayoutBaseProps {
	/** Widget mode: compact embeddable panel with a floating trigger button */
	layout: "widget";
	/** Height of the widget panel. Default: `"600px"` */
	widgetHeight?: string | number;
	/** Width of the widget panel. Default: `"380px"` */
	widgetWidth?: string | number;
	/**
	 * Whether the widget panel starts open. Default: `false`.
	 * Set to `true` when embedding inside an already-open container such as a
	 * Next.js intercepting-route modal — the panel will be immediately visible
	 * without the user needing to click the trigger button.
	 */
	defaultOpen?: boolean;
	/**
	 * Whether to render the built-in floating trigger button. Default: `true`.
	 * Set to `false` when you control open/close externally (e.g. a Next.js
	 * parallel-route slot, a custom button, or a `router.back()` dismiss action)
	 * so that the built-in button does not appear alongside your own UI.
	 */
	showTrigger?: boolean;
}

interface ChatLayoutFullProps extends ChatLayoutBaseProps {
	/** Full-page mode with sidebar navigation (default) */
	layout?: "full";
}

/** Props for the ChatLayout component */
export type ChatLayoutProps = ChatLayoutWidgetProps | ChatLayoutFullProps;

/**
 * ChatLayout component that provides a full-page chat experience with sidebar
 * or a compact widget mode for embedding.
 */
export function ChatLayout(props: ChatLayoutProps) {
	const {
		apiBaseURL,
		apiBasePath,
		conversationId,
		layout = "full",
		className,
		showSidebar = true,
		initialMessages,
		onMessagesChange,
	} = props;

	// Widget-specific props — TypeScript narrows props to ChatLayoutWidgetProps here
	const widgetHeight =
		props.layout === "widget" ? (props.widgetHeight ?? "600px") : "600px";
	const widgetWidth =
		props.layout === "widget" ? (props.widgetWidth ?? "380px") : "380px";
	const defaultOpen =
		props.layout === "widget" ? (props.defaultOpen ?? false) : false;
	const showTrigger =
		props.layout === "widget" ? (props.showTrigger ?? true) : true;

	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	// Key to force ChatInterface remount when starting a new chat
	const [chatResetKey, setChatResetKey] = useState(0);
	// Widget open/closed state — starts with defaultOpen value
	const [widgetOpen, setWidgetOpen] = useState(defaultOpen);
	// Key to force widget ChatInterface remount on clear
	const [widgetResetKey, setWidgetResetKey] = useState(0);
	// Only mount the widget ChatInterface after the widget has been opened at least once.
	// This ensures pageAIContext is already registered before ChatInterface first renders,
	// so suggestion chips and tool hints appear immediately on first open.
	// When defaultOpen is true the widget is pre-opened, so we mark it as ever-opened immediately.
	const [widgetEverOpened, setWidgetEverOpened] = useState(defaultOpen);

	// Read page AI context to show badge in header
	const pageAIContext = usePageAIContext();

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
			<div className={cn("flex flex-col items-end gap-3", className)}>
				{/* Chat panel — always mounted to preserve conversation state, hidden when closed */}
				<div
					className={cn(
						"flex flex-col border rounded-xl overflow-hidden bg-background shadow-xl",
						widgetOpen ? "flex" : "hidden",
					)}
					style={{ height: widgetHeight, width: widgetWidth }}
				>
					{/* Widget header with page context badge and action buttons */}
					<div className="flex items-center gap-1.5 px-3 py-1.5 border-b bg-muted/40">
						<Sparkles className="h-3 w-3 text-muted-foreground" />
						{pageAIContext ? (
							<Badge
								variant="secondary"
								className="text-xs"
								data-testid="page-context-badge"
							>
								{pageAIContext.routeName}
							</Badge>
						) : (
							<span className="text-xs text-muted-foreground font-medium">
								AI Chat
							</span>
						)}
						<div className="flex-1" />
						<Button
							variant="ghost"
							size="icon"
							className="h-5 w-5"
							onClick={() => setWidgetResetKey((prev) => prev + 1)}
							aria-label="Clear chat"
							title="Clear chat"
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-5 w-5"
							onClick={() => setWidgetOpen(false)}
							aria-label="Close chat"
						>
							<X className="h-3.5 w-3.5" />
						</Button>
					</div>
					{widgetEverOpened && (
						<ChatInterface
							key={`widget-${conversationId ?? "new"}-${widgetResetKey}`}
							apiPath={apiPath}
							id={conversationId}
							variant="widget"
							initialMessages={initialMessages}
							onMessagesChange={onMessagesChange}
						/>
					)}
				</div>

				{/* Trigger button — rendered only when showTrigger is true */}
				{showTrigger && (
					<Button
						size="icon"
						className="h-12 w-12 rounded-full shadow-lg"
						onClick={() => {
							setWidgetOpen((prev) => !prev);
							setWidgetEverOpened(true);
						}}
						aria-label={widgetOpen ? "Close chat" : "Open chat"}
						data-testid="widget-trigger"
					>
						{widgetOpen ? (
							<X className="h-5 w-5" />
						) : (
							<Sparkles className="h-5 w-5" />
						)}
					</Button>
				)}
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
				<div className="flex items-center gap-2 p-2 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
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

					{/* Page context badge — shown when a page has registered AI context */}
					{pageAIContext && (
						<Badge
							variant="secondary"
							className="text-xs gap-1 mr-2"
							data-testid="page-context-badge"
						>
							<Sparkles className="h-3 w-3" />
							{pageAIContext.routeName}
						</Badge>
					)}
				</div>

				<ChatInterface
					key={`chat-${conversationId ?? "new"}-${chatResetKey}`}
					apiPath={apiPath}
					id={conversationId}
					variant="full"
					initialMessages={initialMessages}
					onMessagesChange={onMessagesChange}
				/>
			</div>
		</div>
	);
}
