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
import { usePluginOverrides, useBasePath } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";
import type { SerializedConversation } from "../../types";
import {
	useConversations,
	useRenameConversation,
	useDeleteConversation,
} from "../hooks/chat-hooks";
import { AI_CHAT_LOCALIZATION } from "../localization";

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
	const { navigate, localization: customLocalization } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {});
	const basePath = useBasePath();

	const localization = { ...AI_CHAT_LOCALIZATION, ...customLocalization };

	const { conversations, isLoading } = useConversations();
	const renameMutation = useRenameConversation();
	const deleteMutation = useDeleteConversation();

	const [renameDialogOpen, setRenameDialogOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [selectedConversation, setSelectedConversation] =
		useState<SerializedConversation | null>(null);
	const [newTitle, setNewTitle] = useState("");

	const handleNewChat = () => {
		if (onNewChat) {
			onNewChat();
		} else if (navigate) {
			navigate(`${basePath}/chat`);
		}
	};

	const handleConversationClick = (conversation: SerializedConversation) => {
		if (navigate) {
			navigate(`${basePath}/chat/${conversation.id}`);
		}
	};

	const handleRenameClick = (conversation: SerializedConversation) => {
		setSelectedConversation(conversation);
		setNewTitle(conversation.title);
		setRenameDialogOpen(true);
	};

	const handleDeleteClick = (conversation: SerializedConversation) => {
		setSelectedConversation(conversation);
		setDeleteDialogOpen(true);
	};

	const handleRenameConfirm = async () => {
		if (selectedConversation && newTitle.trim()) {
			await renameMutation.mutateAsync({
				id: selectedConversation.id,
				title: newTitle.trim(),
			});
			setRenameDialogOpen(false);
			setSelectedConversation(null);
			setNewTitle("");
		}
	};

	const handleDeleteConfirm = async () => {
		if (selectedConversation) {
			await deleteMutation.mutateAsync({ id: selectedConversation.id });
			setDeleteDialogOpen(false);
			setSelectedConversation(null);
			// Navigate away if deleted current conversation
			if (selectedConversation.id === currentConversationId && navigate) {
				navigate(`${basePath}/chat`);
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

		if (diffMins < 1) return localization.TIME_JUST_NOW;
		if (diffMins < 60)
			return localization.TIME_MINUTES_AGO.replace("{count}", String(diffMins));
		if (diffHours < 24)
			return localization.TIME_HOURS_AGO.replace("{count}", String(diffHours));
		if (diffDays === 1) return localization.TIME_YESTERDAY;
		if (diffDays < 7)
			return localization.TIME_DAYS_AGO.replace("{count}", String(diffDays));
		return date.toLocaleDateString();
	};

	return (
		<div className={cn("flex flex-col h-full bg-muted/30 border-r", className)}>
			{/* Header */}
			<div className="p-4 border-b">
				<Button
					onClick={handleNewChat}
					className="w-full justify-start gap-2"
					variant="outline"
				>
					<MessageSquarePlus className="h-4 w-4" />
					{localization.SIDEBAR_NEW_CHAT}
				</Button>
			</div>

			{/* Conversations List */}
			<ScrollArea className="flex-1">
				<div className="p-2">
					{isLoading ? (
						<div className="p-4 text-center text-sm text-muted-foreground">
							{localization.CHAT_LOADING}
						</div>
					) : conversations.length === 0 ? (
						<div className="p-4 text-center text-sm text-muted-foreground">
							{localization.SIDEBAR_NO_CONVERSATIONS}
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
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
											>
												<MoreHorizontal className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onClick={(e) => {
													e.stopPropagation();
													handleRenameClick(conversation);
												}}
											>
												<Pencil className="h-4 w-4 mr-2" />
												{localization.CONVERSATION_RENAME}
											</DropdownMenuItem>
											<DropdownMenuItem
												onClick={(e) => {
													e.stopPropagation();
													handleDeleteClick(conversation);
												}}
												className="text-destructive focus:text-destructive"
											>
												<Trash2 className="h-4 w-4 mr-2" />
												{localization.CONVERSATION_DELETE}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							))}
						</div>
					)}
				</div>
			</ScrollArea>

			{/* Rename Dialog */}
			<Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{localization.CONVERSATION_RENAME}</DialogTitle>
					</DialogHeader>
					<Input
						value={newTitle}
						onChange={(e) => setNewTitle(e.target.value)}
						placeholder={localization.CONVERSATION_RENAME_PLACEHOLDER}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								void handleRenameConfirm();
							}
						}}
					/>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRenameDialogOpen(false)}
						>
							{localization.CONVERSATION_RENAME_CANCEL}
						</Button>
						<Button
							onClick={handleRenameConfirm}
							disabled={!newTitle.trim() || renameMutation.isPending}
						>
							{localization.CONVERSATION_RENAME_SAVE}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{localization.CONVERSATION_DELETE_CONFIRM_TITLE}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{localization.CONVERSATION_DELETE_CONFIRM_DESCRIPTION}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							{localization.CONVERSATION_DELETE_CANCEL}
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteConfirm}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{localization.CONVERSATION_DELETE_CONFIRM_BUTTON}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
