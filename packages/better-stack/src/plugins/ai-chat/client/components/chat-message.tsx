"use client";

import { cn } from "@workspace/ui/lib/utils";
import { MarkdownContent } from "@workspace/ui/components/markdown-content";
import {
	Dialog,
	DialogContent,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { User, Bot, FileText } from "lucide-react";
import type { UIMessage } from "ai";
import { useMemo, useState, type ComponentType } from "react";
import { usePluginOverrides } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";
import { AI_CHAT_LOCALIZATION } from "../localization";

// Import shared markdown + syntax highlighting styles (same pattern as blog plugin)
import "@workspace/ui/markdown-content.css";
import "highlight.js/styles/panda-syntax-light.css";

// Import remend for streaming markdown
import completeMarkdown from "remend";

// Fallback components (so consumers don't have to provide them)
const DefaultLink = (props: React.ComponentProps<"a">) => <a {...props} />;
const DefaultImage = (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
	<img {...props} />
);

// Clickable image component that opens in a dialog
interface ClickableImageProps {
	src: string;
	alt: string;
	/** Width in pixels for the thumbnail */
	width?: number;
	/** Height in pixels for the thumbnail */
	height?: number;
	className?: string;
	ImageComponent: ComponentType<React.ImgHTMLAttributes<HTMLImageElement>>;
}

function ClickableImage({
	src,
	alt,
	width = 200,
	height = 200,
	className,
	ImageComponent,
}: ClickableImageProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md overflow-hidden"
				style={{ width, height }}
			>
				<ImageComponent
					src={src}
					alt={alt}
					width={width}
					height={height}
					className={cn(
						"object-cover hover:opacity-90 transition-opacity",
						className,
					)}
				/>
			</button>
			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent
					className="max-w-[90vw] max-h-[90vh] p-2 sm:max-w-[90vw]"
					showCloseButton
				>
					<DialogTitle className="sr-only">{alt}</DialogTitle>
					<div className="flex items-center justify-center">
						{/* Use native img for full-size preview to avoid Next.js Image constraints */}
						<img
							src={src}
							alt={alt}
							className="max-w-full max-h-[85vh] object-contain rounded-md"
						/>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

interface ChatMessageProps {
	message: UIMessage;
	isStreaming?: boolean;
	variant?: "default" | "compact";
}

export function ChatMessage({
	message,
	isStreaming = false,
	variant = "default",
}: ChatMessageProps) {
	const isUser = message.role === "user";

	const {
		Link,
		Image,
		localization: customLocalization,
	} = usePluginOverrides<AiChatPluginOverrides, Partial<AiChatPluginOverrides>>(
		"ai-chat",
		{},
	);

	const localization = { ...AI_CHAT_LOCALIZATION, ...customLocalization };

	// Use provided Image component or fallback to default
	const ImageComponent = Image ?? DefaultImage;

	// Extract text content from message parts
	const textContent = useMemo(() => {
		if (message.parts && Array.isArray(message.parts)) {
			return message.parts
				.filter((part: any) => part.type === "text")
				.map((part: any) => part.text)
				.join("");
		}
		return "";
	}, [message.parts]);

	// Extract image parts from message
	const imageParts = useMemo(() => {
		if (message.parts && Array.isArray(message.parts)) {
			return message.parts.filter(
				(part: any) =>
					part.type === "file" && part.mediaType?.startsWith("image/"),
			);
		}
		return [];
	}, [message.parts]);

	// Extract non-image file parts from message (PDFs, text files, etc.)
	const fileParts = useMemo(() => {
		if (message.parts && Array.isArray(message.parts)) {
			return message.parts.filter(
				(part: any) =>
					part.type === "file" && !part.mediaType?.startsWith("image/"),
			);
		}
		return [];
	}, [message.parts]);

	// Use remend to complete partial markdown when streaming
	const displayContent = useMemo(() => {
		if (!textContent) return "";
		if (isStreaming && !isUser) {
			// Complete any unclosed markdown elements during streaming
			return completeMarkdown(textContent);
		}
		return textContent;
	}, [textContent, isStreaming, isUser]);

	const isCompact = variant === "compact";

	return (
		<div
			className={cn(
				"flex gap-3 w-full",
				isCompact ? "mb-3" : "mb-4",
				isUser ? "justify-end" : "justify-start",
			)}
			aria-label={
				isUser
					? localization.A11Y_USER_MESSAGE
					: localization.A11Y_ASSISTANT_MESSAGE
			}
		>
			{/* Assistant Avatar */}
			{!isUser && (
				<div
					className={cn(
						"rounded-full bg-muted flex items-center justify-center shrink-0",
						isCompact ? "w-7 h-7" : "w-8 h-8",
					)}
				>
					<Bot className={cn(isCompact ? "w-4 h-4" : "w-5 h-5")} />
				</div>
			)}

			{/* Message Content */}
			<div
				className={cn(
					"rounded-lg",
					isCompact ? "px-3 py-2 max-w-[85%]" : "px-4 py-3 max-w-[80%]",
					isUser ? "bg-primary text-primary-foreground" : "bg-muted",
				)}
			>
				{isUser ? (
					// User messages: files + images + text
					<div className="space-y-2">
						{/* Attached files (non-images) */}
						{fileParts.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{fileParts.map((part: any, index: number) => (
									<a
										key={index}
										href={part.url}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors"
									>
										<FileText className="h-4 w-4 shrink-0" />
										<span className="text-xs truncate max-w-[150px]">
											{part.filename || "File"}
										</span>
									</a>
								))}
							</div>
						)}
						{/* Attached images */}
						{imageParts.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{imageParts.map((part: any, index: number) => (
									<ClickableImage
										key={index}
										src={part.url}
										alt={part.filename || `Attached image ${index + 1}`}
										width={150}
										height={150}
										className="rounded-md"
										ImageComponent={ImageComponent}
									/>
								))}
							</div>
						)}
						{/* Text content */}
						{textContent && (
							<p
								className={cn(
									"whitespace-pre-wrap wrap-break-word",
									isCompact ? "text-sm" : "text-sm",
								)}
							>
								{textContent}
							</p>
						)}
					</div>
				) : (
					// Assistant messages: rendered markdown + files + images
					<div className="wrap-break-word space-y-2">
						{/* Any attached files (non-images) */}
						{fileParts.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{fileParts.map((part: any, index: number) => (
									<a
										key={index}
										href={part.url}
										target="_blank"
										rel="noopener noreferrer"
										className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted-foreground/10 hover:bg-muted-foreground/20 transition-colors border"
									>
										<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
										<span className="text-xs truncate max-w-[150px]">
											{part.filename || "File"}
										</span>
									</a>
								))}
							</div>
						)}
						{/* Any attached/generated images */}
						{imageParts.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{imageParts.map((part: any, index: number) => (
									<ClickableImage
										key={index}
										src={part.url}
										alt={part.filename || `Image ${index + 1}`}
										width={200}
										height={200}
										className="rounded-md"
										ImageComponent={ImageComponent}
									/>
								))}
							</div>
						)}
						{/* Text content */}
						{displayContent ? (
							<MarkdownContent
								markdown={displayContent}
								variant="chat"
								LinkComponent={Link ?? DefaultLink}
								ImageComponent={ImageComponent}
							/>
						) : imageParts.length === 0 && fileParts.length === 0 ? (
							<span className="text-muted-foreground">...</span>
						) : null}
					</div>
				)}
			</div>

			{/* User Avatar */}
			{isUser && (
				<div
					className={cn(
						"rounded-full bg-primary flex items-center justify-center shrink-0 text-primary-foreground",
						isCompact ? "w-7 h-7" : "w-8 h-8",
					)}
				>
					<User className={cn(isCompact ? "w-4 h-4" : "w-5 h-5")} />
				</div>
			)}
		</div>
	);
}
