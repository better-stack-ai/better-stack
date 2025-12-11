"use client";

import { useRef, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Send, ImagePlus, X, Loader2 } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { toast } from "sonner";
import { usePluginOverrides } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "../overrides";
import { AI_CHAT_LOCALIZATION } from "../localization";
import type { FormEvent } from "react";

interface ChatInputProps {
	input?: string;
	handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
	handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
	isLoading: boolean;
	placeholder?: string;
	variant?: "default" | "compact";
	/** Callback when images are attached */
	onImagesAttached?: (urls: string[]) => void;
}

export function ChatInput({
	input = "",
	handleInputChange,
	handleSubmit,
	isLoading,
	placeholder,
	variant = "default",
	onImagesAttached,
}: ChatInputProps) {
	const { uploadImage, localization: customLocalization } = usePluginOverrides<
		AiChatPluginOverrides,
		Partial<AiChatPluginOverrides>
	>("ai-chat", {});

	const localization = { ...AI_CHAT_LOCALIZATION, ...customLocalization };

	const fileInputRef = useRef<HTMLInputElement>(null);
	const [attachedImages, setAttachedImages] = useState<string[]>([]);
	const [isUploading, setIsUploading] = useState(false);

	const isCompact = variant === "compact";

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e as any);
		}
	};

	const handleImageUpload = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith("image/")) {
			toast.error(localization.IMAGE_UPLOAD_ERROR_NOT_IMAGE);
			return;
		}

		if (file.size > 4 * 1024 * 1024) {
			toast.error(localization.IMAGE_UPLOAD_ERROR_TOO_LARGE);
			return;
		}

		if (!uploadImage) {
			// If no upload handler, try to create a data URL
			const reader = new FileReader();
			reader.onload = (e) => {
				const dataUrl = e.target?.result as string;
				setAttachedImages((prev) => [...prev, dataUrl]);
				if (onImagesAttached) {
					onImagesAttached([...attachedImages, dataUrl]);
				}
			};
			reader.readAsDataURL(file);
			return;
		}

		try {
			setIsUploading(true);
			const url = await uploadImage(file);
			setAttachedImages((prev) => [...prev, url]);
			if (onImagesAttached) {
				onImagesAttached([...attachedImages, url]);
			}
			toast.success(localization.IMAGE_UPLOAD_SUCCESS);
		} catch (error) {
			console.error("Failed to upload image:", error);
			toast.error(localization.IMAGE_UPLOAD_FAILURE);
		} finally {
			setIsUploading(false);
			// Reset the input
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const removeImage = (index: number) => {
		setAttachedImages((prev) => {
			const newImages = prev.filter((_, i) => i !== index);
			if (onImagesAttached) {
				onImagesAttached(newImages);
			}
			return newImages;
		});
	};

	const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
		// Clear attached images on submit
		setAttachedImages([]);
		handleSubmit(e);
	};

	const hasUploadImage = typeof uploadImage === "function";

	return (
		<form onSubmit={handleFormSubmit} className="space-y-2">
			{/* Attached Images Preview */}
			{attachedImages.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{attachedImages.map((url, index) => (
						<div
							key={index}
							className="relative group rounded-lg overflow-hidden border"
						>
							<img
								src={url}
								alt={`Attached image ${index + 1}`}
								className="h-16 w-16 object-cover"
							/>
							<button
								type="button"
								onClick={() => removeImage(index)}
								className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
							>
								<X className="h-3 w-3" />
							</button>
						</div>
					))}
				</div>
			)}

			{/* Input Area */}
			<div className="relative flex items-end gap-2">
				{/* Image Upload Button */}
				{hasUploadImage && (
					<>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							onChange={handleImageUpload}
							className="hidden"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							onClick={() => fileInputRef.current?.click()}
							disabled={isLoading || isUploading}
							className={cn("shrink-0", isCompact ? "h-8 w-8" : "h-9 w-9")}
							aria-label={localization.IMAGE_UPLOAD_BUTTON}
						>
							{isUploading ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<ImagePlus className="h-4 w-4" />
							)}
						</Button>
					</>
				)}

				{/* Text Input */}
				<div className="relative flex-1">
					<Textarea
						value={input}
						onChange={handleInputChange}
						onKeyDown={handleKeyDown}
						placeholder={placeholder || localization.CHAT_PLACEHOLDER}
						className={cn(
							"resize-none pr-12",
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
							isLoading || (!input?.trim() && attachedImages.length === 0)
						}
						className={cn(
							"absolute right-2 bottom-2",
							isCompact ? "h-7 w-7" : "h-8 w-8",
						)}
						aria-label={localization.CHAT_SEND_BUTTON}
					>
						<Send className={cn(isCompact ? "h-3.5 w-3.5" : "h-4 w-4")} />
					</Button>
				</div>
			</div>
		</form>
	);
}
