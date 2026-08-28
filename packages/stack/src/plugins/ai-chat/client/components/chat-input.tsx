"use client";

import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Send, Paperclip, X, Loader2, FileText } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import {
	PermissionCheck,
	useNotify,
	usePluginOverrides,
} from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";
import { DEFAULT_ALLOWED_FILE_TYPES, FILE_TYPE_MIME_MAP } from "../overrides";
import { useAiChatTranslation } from "../localization";
import type { FormEvent } from "react";
import { aiChatPermissions } from "../../permissions";

/** Represents an attached file with metadata */
export interface AttachedFile {
	/** Data URL or uploaded URL */
	url: string;
	/** MIME type of the file */
	mediaType: string;
	/** Original filename */
	filename: string;
}

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

interface ChatInputProps {
	input?: string;
	handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
	handleSubmit: (e: FormEvent<HTMLFormElement>, files?: AttachedFile[]) => void;
	isLoading: boolean;
	placeholder?: string;
	variant?: "default" | "compact";
	/** Callback when files are attached (for controlled mode) */
	onFilesAttached?: (files: AttachedFile[]) => void;
	/** Attached files (for controlled mode) */
	attachedFiles?: AttachedFile[];
	/** Browser permission hint for showing attachment controls. */
	allowAttachments?: boolean;
	/** Rendered owner hints for an exact attachment permission check. */
	attachmentPermissionFacts?: {
		conversationId?: string;
		ownerId?: string;
	};
}

function AttachmentPermissionEffect({
	file,
	can,
	isPending,
	error,
	onAllowed,
	onDenied,
}: {
	file: File;
	can: boolean;
	isPending: boolean;
	error?: Error;
	onAllowed: (file: File) => void;
	onDenied: () => void;
}) {
	useEffect(() => {
		if (isPending) return;
		if (can && !error) onAllowed(file);
		else onDenied();
	}, [can, error, file, isPending, onAllowed, onDenied]);
	return null;
}

export function ChatInput({
	input = "",
	handleInputChange,
	handleSubmit,
	isLoading,
	placeholder,
	variant = "default",
	onFilesAttached,
	attachedFiles: controlledFiles,
	allowAttachments = true,
	attachmentPermissionFacts,
}: ChatInputProps) {
	const {
		uploadFile,
		localization: customLocalization,
		mode,
		allowedFileTypes,
	} = usePluginOverrides<AiChatPluginOverrides, Partial<AiChatPluginOverrides>>(
		"aiChat",
		{},
	);

	const notify = useNotify();
	const tr = useAiChatTranslation(customLocalization);

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [internalFiles, setInternalFiles] = useState<AttachedFile[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const uploadGeneration = useRef(0);
	useLayoutEffect(
		() => () => {
			uploadGeneration.current += 1;
		},
		[],
	);

	// Use controlled files if provided, otherwise use internal state
	const attachedFiles = controlledFiles ?? internalFiles;
	const isControlled = controlledFiles !== undefined;

	// Helper to add a file, using functional update for uncontrolled mode
	const addFile = (file: AttachedFile) => {
		if (isControlled && onFilesAttached) {
			// In controlled mode, parent manages state - pass current + new
			onFilesAttached([...attachedFiles, file]);
		} else {
			// In uncontrolled mode, use functional update to avoid stale closure
			setInternalFiles((prev) => [...prev, file]);
		}
	};

	// Helper to remove a file by index - uses functional update to avoid stale closure
	const removeFileAtIndex = (index: number) => {
		if (isControlled && onFilesAttached) {
			// For controlled mode, we need to compute the new array based on current state
			// The parent should ideally use functional updates too, but we pass the filtered array
			// based on the latest controlledFiles prop. If rapid clicks occur before re-render,
			// this could still be stale - parent component should handle batched updates appropriately.
			onFilesAttached(attachedFiles.filter((_, i) => i !== index));
		} else {
			// Uncontrolled mode: use functional update to ensure we always filter from latest state
			setInternalFiles((prev) => prev.filter((_, i) => i !== index));
		}
	};

	const isCompact = variant === "compact";
	const isPublicMode = mode === "public";

	// Get effective allowed file types (default to all if not specified)
	const effectiveAllowedTypes = allowedFileTypes ?? DEFAULT_ALLOWED_FILE_TYPES;

	// Compute the accept string for the file input
	const acceptString = useMemo(() => {
		if (effectiveAllowedTypes.length === 0) return "";
		const mimeTypes = effectiveAllowedTypes.flatMap(
			(type) => FILE_TYPE_MIME_MAP[type] || [],
		);
		return mimeTypes.join(",");
	}, [effectiveAllowedTypes]);

	// File uploads are disabled in public mode or if no file types are allowed
	const canUploadFiles =
		allowAttachments &&
		!isPublicMode &&
		typeof uploadFile === "function" &&
		effectiveAllowedTypes.length > 0;

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			// Pass files to parent and let parent clear them after processing
			handleSubmit(
				e as unknown as FormEvent<HTMLFormElement>,
				attachedFiles.length > 0 ? attachedFiles : undefined,
			);
			// Clear internal files if not controlled
			if (!controlledFiles) {
				setInternalFiles([]);
			}
		}
	};

	const uploadSelectedFile = async (file: File) => {
		const generation = uploadGeneration.current;
		const isCurrentUpload = () => generation === uploadGeneration.current;
		setPendingFile(null);
		// Use uploadFile if available, otherwise create data URL
		if (uploadFile) {
			try {
				setIsUploading(true);
				const url = await uploadFile(file);
				if (!isCurrentUpload()) return;
				addFile({ url, mediaType: file.type, filename: file.name });
				notify.success(
					tr(
						"FILE_UPLOAD_SUCCESS",
						"aiChat.files.uploadSuccess",
						"File attached",
					),
				);
			} catch (error) {
				if (!isCurrentUpload()) return;
				console.error("Failed to upload file:", error);
				notify.error(
					tr(
						"FILE_UPLOAD_FAILURE",
						"aiChat.files.uploadFailure",
						"Failed to attach file",
					),
				);
			} finally {
				if (isCurrentUpload()) setIsUploading(false);
			}
		} else {
			setIsUploading(true);
			const reader = new FileReader();
			reader.onload = (event) => {
				if (!isCurrentUpload()) return;
				const dataUrl = event.target?.result as string;
				addFile({ url: dataUrl, mediaType: file.type, filename: file.name });
				setIsUploading(false);
			};
			reader.onerror = () => {
				if (!isCurrentUpload()) return;
				notify.error(
					tr(
						"FILE_UPLOAD_FAILURE",
						"aiChat.files.uploadFailure",
						"Failed to attach file",
					),
				);
				setIsUploading(false);
			};
			reader.readAsDataURL(file);
		}
	};

	const denySelectedFile = () => {
		setPendingFile(null);
		notify.error(
			tr(
				"FILE_UPLOAD_FAILURE",
				"aiChat.files.uploadFailure",
				"You do not have permission to attach this file type",
			),
		);
	};

	const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (file.size > MAX_FILE_SIZE) {
			notify.error(
				tr(
					"FILE_UPLOAD_ERROR_TOO_LARGE",
					"aiChat.files.tooLarge",
					"File must be less than 10MB",
				),
			);
			return;
		}

		setPendingFile(file);

		// Reset the input
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
	};

	const removeFile = (index: number) => {
		removeFileAtIndex(index);
	};

	const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
		// Pass files to parent and let parent clear them after processing
		handleSubmit(e, attachedFiles.length > 0 ? attachedFiles : undefined);
		// Clear internal files if not controlled
		if (!controlledFiles) {
			setInternalFiles([]);
		}
	};

	// Check if a file is an image based on media type
	const isImageFile = (mediaType: string) => mediaType.startsWith("image/");

	return (
		<>
			{pendingFile && (
				<PermissionCheck
					permission={aiChatPermissions.attachment.send({
						...(attachmentPermissionFacts?.conversationId
							? {
									conversationId: attachmentPermissionFacts.conversationId,
								}
							: {}),
						...(attachmentPermissionFacts?.ownerId
							? { ownerId: attachmentPermissionFacts.ownerId }
							: {}),
						mediaTypes: [pendingFile.type],
					})}
				>
					{(state) => (
						<AttachmentPermissionEffect
							file={pendingFile}
							can={state.can}
							isPending={state.isPending}
							error={state.error}
							onAllowed={uploadSelectedFile}
							onDenied={denySelectedFile}
						/>
					)}
				</PermissionCheck>
			)}
			<form onSubmit={handleFormSubmit} className="space-y-2">
				{/* Attached Files Preview */}
				{attachedFiles.length > 0 && (
					<div className="flex flex-wrap gap-2">
						{attachedFiles.map((file, index) => (
							<div
								key={index}
								className="relative group rounded-lg overflow-hidden border"
							>
								{isImageFile(file.mediaType) ? (
									// Image preview
									<img
										src={file.url}
										alt={file.filename}
										className="h-16 w-16 object-cover"
									/>
								) : (
									// File preview with icon
									<div className="w-32 flex items-center gap-2 p-2 bg-muted">
										<FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
										<span className="text-xs truncate" title={file.filename}>
											{file.filename}
										</span>
									</div>
								)}
								<button
									type="button"
									onClick={() => removeFile(index)}
									className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
									aria-label={tr(
										"FILE_REMOVE",
										"aiChat.files.remove",
										"Remove file",
									)}
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						))}
					</div>
				)}

				{/* Input Area */}
				<div className="relative flex items-center gap-2">
					{/* File Upload Button - hidden in public mode */}
					{canUploadFiles && (
						<>
							<input
								ref={fileInputRef}
								type="file"
								accept={acceptString}
								onChange={handleFileUpload}
								className="hidden"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								onClick={() => fileInputRef.current?.click()}
								disabled={isLoading || isUploading}
								className={cn("shrink-0", isCompact ? "h-8 w-8" : "h-9 w-9")}
								aria-label={tr(
									"FILE_UPLOAD_BUTTON",
									"aiChat.files.attach",
									"Attach file",
								)}
							>
								{isUploading ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Paperclip className="h-4 w-4" />
								)}
							</Button>
						</>
					)}

					{/* Text Input */}
					<div className="relative flex-1 min-w-0">
						<Textarea
							value={input}
							onChange={handleInputChange}
							onKeyDown={handleKeyDown}
							placeholder={
								placeholder ||
								tr(
									"CHAT_PLACEHOLDER",
									"aiChat.chat.placeholder",
									"Type a message...",
								)
							}
							className={cn(
								"resize-none pr-12 max-w-full",
								isCompact
									? "min-h-[40px] max-h-[120px] py-2"
									: "min-h-[50px] max-h-[200px] py-3",
							)}
							rows={1}
						/>
						<Button
							type="submit"
							size="icon"
							disabled={
								isLoading || (!input?.trim() && attachedFiles.length === 0)
							}
							className={cn(
								"absolute right-2 bottom-2",
								isCompact ? "h-7 w-7" : "h-8 w-8",
							)}
							aria-label={tr("CHAT_SEND_BUTTON", "aiChat.chat.send", "Send")}
						>
							<Send className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4")} />
						</Button>
					</div>
				</div>
			</form>
		</>
	);
}
