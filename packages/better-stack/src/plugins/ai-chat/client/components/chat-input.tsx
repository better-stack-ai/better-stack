"use client";

import { Button } from "@workspace/ui/components/button";
import { Textarea } from "@workspace/ui/components/textarea";
import { Send } from "lucide-react";
import type { FormEvent } from "react";

interface ChatInputProps {
	input?: string;
	handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
	handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
	isLoading: boolean;
}

export function ChatInput({
	input = "",
	handleInputChange,
	handleSubmit,
	isLoading,
}: ChatInputProps) {
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e as any);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="relative flex items-center w-full">
			<Textarea
				value={input}
				onChange={handleInputChange}
				onKeyDown={handleKeyDown}
				placeholder="Type a message..."
				className="min-h-[50px] max-h-[200px] pr-12 resize-none py-3"
				rows={1}
			/>
			<Button
				type="submit"
				size="icon"
				disabled={isLoading || !input?.trim()}
				className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
			>
				<Send className="h-4 w-4" />
			</Button>
		</form>
	);
}
