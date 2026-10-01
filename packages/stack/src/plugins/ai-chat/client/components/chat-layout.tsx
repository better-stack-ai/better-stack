"use client";

import {
	useState,
	useCallback,
	useEffect,
	useRef,
	type CSSProperties,
} from "react";
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
	Maximize2,
	Minimize2,
	Trash2,
	X,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { ChatSidebar } from "./chat-sidebar";
import { ChatInterface } from "./chat-interface";
import type { UIMessage } from "ai";
import {
	usePageAIContext,
	PageAIContextScope,
	type PageAIContextConfig,
} from "../context/page-ai-context";
import { usePluginOverrides, useStack } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";
import { resolveAiChatMode } from "../overrides";
import {
	ChatAnalyticsPageKey,
	useChatAnalytics,
} from "../context/chat-analytics";
import { useAiChatTranslation } from "../localization";

interface ChatLayoutBaseProps {
	/** Current conversation ID (if viewing existing conversation) */
	conversationId?: string;
	/** Additional class name for the container */
	className?: string;
	/** Additional container styles, including application-specific floating offsets. */
	style?: CSSProperties;
	/** Instance-local context. Omit to inherit page registrations; null disables them. */
	pageContext?: PageAIContextConfig | null;
	/**
	 * Page identity. Changing it resets the panel, tip, and conversation, stopping
	 * an active stream. Supply initialMessages/conversationId for this page only.
	 */
	pageKey?: string;
	/** Whether to show the sidebar */
	showSidebar?: boolean;
	/** Initial messages to populate the chat (useful for localStorage persistence in public mode) */
	initialMessages?: UIMessage[];
	/** Called whenever messages change (for persistence). Only fires in public mode. */
	onMessagesChange?: (messages: UIMessage[]) => void;
	/** Called when the user clears the chat (e.g. clicks the trash button in widget mode). Use this to clear persisted messages. */
	onClear?: () => void;
}

interface ChatLayoutWidgetProps extends ChatLayoutBaseProps {
	/** Widget mode: compact embeddable panel with a floating trigger button */
	layout: "widget";
	/** Height of the widget panel. Default: `"min(640px, calc(100dvh - 112px))"` */
	widgetHeight?: string | number;
	/** Width of the widget panel. Default: `"min(440px, calc(100vw - 32px))"` */
	widgetWidth?: string | number;
	/** Show a button to expand the widget to the viewport. Default: false. Escape restores the compact size. */
	expandable?: boolean;
	/** Fix the widget to the bottom right. Default: false (embedded). Override offsets with className or style. */
	floating?: boolean;
	/** Optional dismissible introduction shown while the widget is closed. */
	introTip?: string;
	/** Milliseconds before hiding the introduction. Default: 6000. */
	introTipDuration?: number;
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
	return (
		<PageAIContextScope.Provider value={props.pageContext}>
			<ChatAnalyticsPageKey.Provider value={props.pageKey}>
				<ChatLayoutContent key={props.pageKey} {...props} />
			</ChatAnalyticsPageKey.Provider>
		</PageAIContextScope.Provider>
	);
}

function ChatLayoutContent(props: ChatLayoutProps) {
	const track = useChatAnalytics();
	const {
		conversationId,
		layout = "full",
		className,
		style,
		showSidebar: requestedShowSidebar = true,
		initialMessages,
		onMessagesChange,
		onClear,
	} = props;
	const { localization, classNames } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("aiChat", {});
	const { plugins } = useStack();
	const resolvedMode = resolveAiChatMode(plugins?.aiChat?.config);
	const showSidebar = requestedShowSidebar && resolvedMode !== "public";
	const tr = useAiChatTranslation(localization);

	// Widget-specific props — TypeScript narrows props to ChatLayoutWidgetProps here
	const widgetHeight =
		props.layout === "widget"
			? (props.widgetHeight ?? "min(640px, calc(100dvh - 112px))")
			: undefined;
	const widgetWidth =
		props.layout === "widget"
			? (props.widgetWidth ?? "min(440px, calc(100vw - 32px))")
			: undefined;
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
	const [expanded, setExpanded] = useState(false);
	const expandable = props.layout === "widget" && props.expandable === true;
	const widgetExpanded = expandable && expanded && widgetOpen;
	const panelRef = useRef<HTMLDialogElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const expandLabel = widgetExpanded
		? tr("A11Y_COLLAPSE_CHAT", "aiChat.a11y.collapseChat", "Collapse chat")
		: tr("A11Y_EXPAND_CHAT", "aiChat.a11y.expandChat", "Expand chat");

	// Keep one panel mounted: moving the chat into a portal would reset its draft/stream.
	// A modal dialog enters the browser's top layer and makes the background inert.
	useEffect(() => {
		const panel = panelRef.current;
		if (!panel || !widgetOpen) return;
		const focused = document.activeElement;
		const overflow = document.body.style.overflow;
		if (widgetExpanded) {
			panel.showModal();
			document.body.style.overflow = "hidden";
		} else {
			panel.open = true;
		}
		if (focused instanceof HTMLElement && panel.contains(focused)) {
			focused.focus();
		}
		return () => {
			if (widgetExpanded) {
				panel.close();
				document.body.style.overflow = overflow;
			} else {
				panel.open = false;
			}
		};
	}, [layout, widgetOpen, widgetExpanded]);
	// Key to force widget ChatInterface remount on clear
	const [widgetResetKey, setWidgetResetKey] = useState(0);
	// Only mount the widget ChatInterface after the widget has been opened at least once.
	// This ensures pageAIContext is already registered before ChatInterface first renders,
	// so suggestion chips and tool hints appear immediately on first open.
	// When defaultOpen is true the widget is pre-opened, so we mark it as ever-opened immediately.
	const [widgetEverOpened, setWidgetEverOpened] = useState(defaultOpen);
	const [tipDismissed, setTipDismissed] = useState(defaultOpen);
	const introTip = props.layout === "widget" ? props.introTip : undefined;
	const introTipDuration =
		props.layout === "widget" ? (props.introTipDuration ?? 6000) : 6000;
	const tipShown = useRef(false);
	const tipDismissedRef = useRef(defaultOpen);
	const dismissTip = useCallback(
		(reason: "timeout" | "manual" | "open") => {
			if (tipShown.current && !tipDismissedRef.current) {
				tipDismissedRef.current = true;
				track({ type: "intro_tip_dismissed", reason });
			}
			setTipDismissed(true);
		},
		[track],
	);
	useEffect(() => {
		if (!introTip || !showTrigger || tipDismissed) return;
		if (!tipShown.current) {
			tipShown.current = true;
			track({ type: "intro_tip_shown" });
		}
		const timeout = setTimeout(() => dismissTip("timeout"), introTipDuration);
		return () => clearTimeout(timeout);
	}, [
		introTip,
		introTipDuration,
		showTrigger,
		tipDismissed,
		dismissTip,
		track,
	]);

	// Read page AI context to show badge in header
	const pageAIContext = usePageAIContext();

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
					"flex flex-col items-end gap-3",
					props.layout === "widget" &&
						props.floating &&
						"fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50",
					className,
					classNames?.container,
				)}
				style={style}
			>
				{introTip && showTrigger && !tipDismissed && !widgetOpen && (
					<div
						role="status"
						className="flex max-w-[min(280px,calc(100vw-32px))] items-center gap-2 rounded-lg border bg-background p-3 text-sm text-foreground shadow-lg"
					>
						<span>{introTip}</span>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-7 w-7 shrink-0"
							onClick={() => dismissTip("manual")}
							aria-label={tr(
								"A11Y_DISMISS_CHAT_TIP",
								"aiChat.a11y.dismissChatTip",
								"Dismiss chat tip",
							)}
						>
							<X className="h-4 w-4" aria-hidden="true" />
						</Button>
					</div>
				)}
				{/* Chat panel — always mounted to preserve conversation state, hidden when closed */}
				<dialog
					ref={panelRef}
					aria-label={tr("A11Y_CHAT_TITLE", "aiChat.a11y.title", "AI Chat")}
					onCancel={(event) => {
						event.preventDefault();
						setExpanded(false);
					}}
					className={cn(
						"m-0 max-h-none max-w-none p-0 text-foreground flex flex-col border rounded-xl overflow-hidden bg-background shadow-xl",
						widgetExpanded
							? "fixed inset-0 rounded-none border-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
							: "static",
						widgetOpen ? "flex" : "hidden",
					)}
					style={{
						height: widgetExpanded ? "100dvh" : widgetHeight,
						width: widgetExpanded ? "100vw" : widgetWidth,
					}}
				>
					{/* Widget header with page context badge and action buttons */}
					<div className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 border-b bg-muted/40">
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
								{tr("A11Y_CHAT_TITLE", "aiChat.a11y.title", "AI Chat")}
							</span>
						)}
						<div className="flex-1" />
						{expandable && (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-7 w-7"
								onClick={() => setExpanded((prev) => !prev)}
								aria-label={expandLabel}
								title={expandLabel}
								aria-expanded={widgetExpanded}
							>
								{widgetExpanded ? (
									<Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
								) : (
									<Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
								)}
							</Button>
						)}
						<Button
							variant="ghost"
							size="icon"
							className="h-5 w-5"
							onClick={() => {
								track({ type: "conversation_cleared" });
								onClear?.();
								setWidgetResetKey((prev) => prev + 1);
							}}
							aria-label={tr(
								"A11Y_CLEAR_CHAT",
								"aiChat.a11y.clearChat",
								"Clear chat",
							)}
							title={tr(
								"A11Y_CLEAR_CHAT",
								"aiChat.a11y.clearChat",
								"Clear chat",
							)}
						>
							<Trash2 className="h-3.5 w-3.5" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-5 w-5"
							onClick={() => {
								panelRef.current?.close();
								setWidgetOpen(false);
								setExpanded(false);
								triggerRef.current?.focus();
								track({ type: "widget_closed" });
							}}
							aria-label={tr(
								"A11Y_CLOSE_CHAT",
								"aiChat.a11y.closeChat",
								"Close chat",
							)}
						>
							<X className="h-3.5 w-3.5" />
						</Button>
					</div>
					{widgetEverOpened && (
						<ChatInterface
							key={`widget-${conversationId ?? "new"}-${widgetResetKey}`}
							id={conversationId}
							variant="widget"
							initialMessages={initialMessages}
							onMessagesChange={onMessagesChange}
						/>
					)}
				</dialog>

				{/* Trigger button — rendered only when showTrigger is true */}
				{showTrigger && (
					<Button
						ref={triggerRef}
						size="icon"
						className="h-12 w-12 rounded-full shadow-lg"
						onClick={() => {
							dismissTip("open");
							track({ type: widgetOpen ? "widget_closed" : "widget_opened" });
							setWidgetOpen((prev) => !prev);
							setExpanded(false);
							setWidgetEverOpened(true);
						}}
						aria-label={
							widgetOpen
								? tr("A11Y_CLOSE_CHAT", "aiChat.a11y.closeChat", "Close chat")
								: tr("A11Y_OPEN_CHAT", "aiChat.a11y.openChat", "Open chat")
						}
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
				classNames?.container,
			)}
			data-testid="chat-layout"
			style={style}
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
									aria-label={tr(
										"A11Y_OPEN_MENU",
										"aiChat.a11y.openMenu",
										"Open menu",
									)}
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
							aria-label={
								sidebarOpen
									? tr(
											"A11Y_CLOSE_SIDEBAR",
											"aiChat.a11y.closeSidebar",
											"Close sidebar",
										)
									: tr(
											"A11Y_OPEN_SIDEBAR",
											"aiChat.a11y.openSidebar",
											"Open sidebar",
										)
							}
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

					{onClear && (
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								track({ type: "conversation_cleared" });
								onClear();
								setChatResetKey((prev) => prev + 1);
							}}
							aria-label={tr(
								"A11Y_CLEAR_CHAT",
								"aiChat.a11y.clearChat",
								"Clear chat",
							)}
							title={tr(
								"A11Y_CLEAR_CHAT",
								"aiChat.a11y.clearChat",
								"Clear chat",
							)}
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					)}
				</div>

				<ChatInterface
					key={`chat-${conversationId ?? "new"}-${chatResetKey}`}
					id={conversationId}
					variant="full"
					initialMessages={initialMessages}
					onMessagesChange={onMessagesChange}
				/>
			</div>
		</div>
	);
}
