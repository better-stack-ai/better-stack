"use client";

import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	MessageSquarePlus,
	MoreHorizontal,
	Pencil,
	Trash2,
	MessageSquare,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
	PermissionAccess,
	useNotify,
	usePluginOverrides,
	useStack,
} from "@btst/stack/context";
import { aiChatPermissions } from "../../permissions";
import type { AiChatPluginOverrides } from "../overrides";
import type { SerializedConversation } from "../../types";
import {
	useConversations,
	useRenameConversationForm,
	useDeleteConversation,
} from "../hooks/chat-hooks";
import { useAiChatTranslation } from "../localization";

interface ChatSidebarProps {
	currentConversationId?: string;
	onNewChat?: () => void;
	className?: string;
}

export function ChatSidebar({
	currentConversationId,
	onNewChat,
	className,
}: ChatSidebarProps) {
	const { localization: customLocalization } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("aiChat", {});
	const { basePath: legacyBasePath, plugins, router } = useStack();
	const navigate = router?.navigate;
	const basePath = plugins?.aiChat?.site.basePath ?? legacyBasePath;
	const notify = useNotify();
	const tr = useAiChatTranslation(customLocalization);
	const { conversations, isLoading } = useConversations();
	const deleteMutation = useDeleteConversation();

	const [renameDialogOpen, setRenameDialogOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [selectedConversation, setSelectedConversation] =
		useState<SerializedConversation | null>(null);
	const [newTitle, setNewTitle] = useState("");
	const renameForm = useRenameConversationForm({
		conversation: selectedConversation,
		onSuccess: () => {
			setRenameDialogOpen(false);
			setSelectedConversation(null);
			setNewTitle("");
		},
	});

	const handleNewChat = () => {
		// Use the StackProvider router when available.
		// Also run onNewChat to support "reset chat" behavior when already on /chat.
		if (navigate) {
			navigate(`${basePath}/chat`);
		}
		if (onNewChat) {
			onNewChat();
		}
	};

	const handleConversationClick = (conversation: SerializedConversation) => {
		if (navigate) {
			navigate(`${basePath}/chat/${conversation.id}`);
		}
	};

	const handleRenameClick = (conversation: SerializedConversation) => {
		renameForm.clearErrors();
		setSelectedConversation(conversation);
		setNewTitle(conversation.title);
		setRenameDialogOpen(true);
	};

	const handleDeleteClick = (conversation: SerializedConversation) => {
		setSelectedConversation(conversation);
		setDeleteDialogOpen(true);
	};

	const handleRenameConfirm = async () => {
		if (selectedConversation) {
			await renameForm.submit({ title: newTitle });
		}
	};

	const handleDeleteConfirm = async () => {
		if (selectedConversation) {
			try {
				await deleteMutation.mutateAsync({ id: selectedConversation.id });
				notify.success(
					tr(
						"CONVERSATION_DELETE_SUCCESS",
						"aiChat.toasts.deleteSuccess",
						"Conversation deleted",
					),
				);
				setDeleteDialogOpen(false);
				setSelectedConversation(null);
				// Navigate away if deleted current conversation
				if (selectedConversation.id === currentConversationId && navigate) {
					await navigate(`${basePath}/chat`);
				}
			} catch {
				notify.error(
					tr(
						"CONVERSATION_DELETE_FAILURE",
						"aiChat.toasts.deleteFailure",
						"Failed to delete conversation",
					),
				);
			}
		}
	};

	const formatDate = (dateString: string) => {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1)
			return tr("TIME_JUST_NOW", "aiChat.time.justNow", "Just now");
		if (diffMins < 60)
			return tr(
				"TIME_MINUTES_AGO",
				"aiChat.time.minutesAgo",
				"{{count}} minutes ago",
				{ count: diffMins },
			);
		if (diffHours < 24)
			return tr(
				"TIME_HOURS_AGO",
				"aiChat.time.hoursAgo",
				"{{count}} hours ago",
				{ count: diffHours },
			);
		if (diffDays === 1)
			return tr("TIME_YESTERDAY", "aiChat.time.yesterday", "Yesterday");
		if (diffDays < 7)
			return tr("TIME_DAYS_AGO", "aiChat.time.daysAgo", "{{count}} days ago", {
				count: diffDays,
			});
		return date.toLocaleDateString();
	};

	return (
		<div
			data-testid="chat-sidebar"
			className={cn("flex flex-col h-full bg-muted/30 border-r", className)}
		>
			{/* Header */}
			<div className="p-4 border-b">
				<PermissionAccess permission={aiChatPermissions.conversation.create()}>
					<Button
						onClick={handleNewChat}
						className="w-full justify-start gap-2"
						variant="outline"
					>
						<MessageSquarePlus className="h-4 w-4" />
						{tr("SIDEBAR_NEW_CHAT", "aiChat.sidebar.newChat", "New chat")}
					</Button>
				</PermissionAccess>
			</div>

			{/* Conversations List */}
			<ScrollArea className="flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
				<div className="p-2">
					{isLoading ? (
						<div className="p-4 text-center text-sm text-muted-foreground">
							{tr("CHAT_LOADING", "aiChat.chat.loading", "Thinking...")}
						</div>
					) : conversations.length === 0 ? (
						<div className="p-4 text-center text-sm text-muted-foreground">
							{tr(
								"SIDEBAR_NO_CONVERSATIONS",
								"aiChat.sidebar.empty",
								"No conversations yet",
							)}
						</div>
					) : (
						<div className="space-y-1">
							{conversations.map((conversation) => (
								<div
									key={conversation.id}
									className={cn(
										"group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent cursor-pointer transition-colors overflow-hidden",
										currentConversationId === conversation.id && "bg-accent",
									)}
								>
									<button
										type="button"
										className="flex-1 flex items-center gap-2 text-left min-w-0 overflow-hidden"
										onClick={() => handleConversationClick(conversation)}
									>
										<MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
										<div className="flex-1 min-w-0 overflow-hidden">
											<p className="text-sm font-medium truncate">
												{conversation.title}
											</p>
											<p className="text-xs text-muted-foreground truncate">
												{formatDate(conversation.updatedAt)}
											</p>
										</div>
									</button>
									<DropdownMenu modal={false}>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
												aria-label={tr(
													"A11Y_CONVERSATION_ACTIONS",
													"aiChat.a11y.conversationActions",
													"Conversation actions",
												)}
											>
												<MoreHorizontal className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<PermissionAccess
												permission={aiChatPermissions.conversation.update({
													conversationId: conversation.id,
													exists: true,
													...(conversation.userId
														? { ownerId: conversation.userId }
														: {}),
												})}
											>
												<DropdownMenuItem
													onClick={(e) => {
														e.stopPropagation();
														handleRenameClick(conversation);
													}}
												>
													<Pencil className="h-4 w-4 mr-2" />
													{tr(
														"CONVERSATION_RENAME",
														"aiChat.conversation.rename",
														"Rename",
													)}
												</DropdownMenuItem>
											</PermissionAccess>
											<PermissionAccess
												permission={aiChatPermissions.conversation.delete({
													conversationId: conversation.id,
													exists: true,
													...(conversation.userId
														? { ownerId: conversation.userId }
														: {}),
												})}
											>
												<DropdownMenuItem
													onClick={(e) => {
														e.stopPropagation();
														handleDeleteClick(conversation);
													}}
													className="text-destructive focus:text-destructive"
												>
													<Trash2 className="h-4 w-4 mr-2" />
													{tr(
														"CONVERSATION_DELETE",
														"aiChat.conversation.delete",
														"Delete",
													)}
												</DropdownMenuItem>
											</PermissionAccess>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							))}
						</div>
					)}
				</div>
			</ScrollArea>

			{/* Rename Dialog */}
			<Dialog
				open={renameDialogOpen}
				onOpenChange={(open) => {
					setRenameDialogOpen(open);
					if (!open) renameForm.clearErrors();
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{tr(
								"CONVERSATION_RENAME",
								"aiChat.conversation.rename",
								"Rename",
							)}
						</DialogTitle>
						<DialogDescription>
							{tr(
								"CONVERSATION_RENAME_DESCRIPTION",
								"aiChat.conversation.renameDescription",
								"Enter a new title for this conversation.",
							)}
						</DialogDescription>
					</DialogHeader>
					<Input
						value={newTitle}
						onChange={(e) => setNewTitle(e.target.value)}
						placeholder={tr(
							"CONVERSATION_RENAME_PLACEHOLDER",
							"aiChat.conversation.renamePlaceholder",
							"Enter conversation name",
						)}
						aria-invalid={!!renameForm.fieldErrors.title}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								void handleRenameConfirm();
							}
						}}
					/>
					{renameForm.fieldErrors.title && (
						<p className="text-sm text-destructive" role="alert">
							{tr(
								"CONVERSATION_TITLE_REQUIRED",
								"aiChat.conversation.titleRequired",
								"Title is required",
							)}
						</p>
					)}
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRenameDialogOpen(false)}
						>
							{tr(
								"CONVERSATION_RENAME_CANCEL",
								"aiChat.conversation.renameCancel",
								"Cancel",
							)}
						</Button>
						<Button
							onClick={handleRenameConfirm}
							disabled={renameForm.isSubmitting}
						>
							{tr(
								"CONVERSATION_RENAME_SAVE",
								"aiChat.conversation.renameSave",
								"Save",
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{tr(
								"CONVERSATION_DELETE_CONFIRM_TITLE",
								"aiChat.conversation.deleteConfirmTitle",
								"Delete conversation",
							)}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{tr(
								"CONVERSATION_DELETE_CONFIRM_DESCRIPTION",
								"aiChat.conversation.deleteConfirmDescription",
								"Are you sure you want to delete this conversation? This action cannot be undone.",
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{tr(
								"CONVERSATION_DELETE_CANCEL",
								"aiChat.conversation.deleteCancel",
								"Cancel",
							)}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={(event) => {
								event.preventDefault();
								void handleDeleteConfirm();
							}}
							disabled={deleteMutation.isPending}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{tr(
								"CONVERSATION_DELETE_CONFIRM_BUTTON",
								"aiChat.conversation.deleteConfirmButton",
								"Delete",
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
