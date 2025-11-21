"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { Card } from "@workspace/ui/components/card";
import { DefaultChatTransport, type UIMessage } from "ai";

interface ChatInterfaceProps {
	apiPath?: string;
	initialMessages?: UIMessage[];
	id?: string;
}

export function ChatInterface({
	apiPath = "/api/chat",
	initialMessages,
	id,
}: ChatInterfaceProps) {
	const { messages, sendMessage, status, error, setMessages } = useChat({
		transport: new DefaultChatTransport({
			api: apiPath,
			body: { conversationId: id },
		}),
		onError: (err) => {
			console.error("useChat onError:", err);
		},
		onFinish: ({ messages: finishedMessages }) => {
			console.log("useChat onFinish - messages from hook:", messages);
			console.log(
				"useChat onFinish - messages from callback:",
				finishedMessages,
			);
		},
	});

	// Set initial messages on mount
	useEffect(() => {
		if (
			initialMessages &&
			initialMessages.length > 0 &&
			messages.length === 0
		) {
			setMessages(initialMessages);
		}
	}, [initialMessages, setMessages]);

	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);

	// Debug: log messages to see if they're being updated
	useEffect(() => {
		console.log("Messages updated:", messages);
		console.log("Message count:", messages.length);
		messages.forEach((msg, idx) => {
			console.log(`Message ${idx}:`, {
				id: msg.id,
				role: msg.role,
				parts: msg.parts,
				partsLength: msg.parts?.length,
			});
		});
	}, [messages]);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		const value = e.target.value;
		setInput(value);
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const text = input.trim();
		if (!text) return;

		console.log("Submitting message:", text);
		setInput("");
		try {
			await sendMessage({ text });
			console.log("Message sent, status:", status);
		} catch (error) {
			console.error("Error sending message:", error);
		}
	};

	const isLoading = status === "streaming" || status === "submitted";

	useEffect(() => {
		console.log("Status changed:", status);
	}, [status]);

	useEffect(() => {
		if (error) {
			console.error("Chat error:", error);
		}
	}, [error]);

	return (
		<Card className="flex flex-col h-[600px] w-full max-w-2xl mx-auto border rounded-xl overflow-hidden shadow-sm bg-background">
			<div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
				{messages.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-muted-foreground">
						<p>Start a conversation...</p>
					</div>
				) : (
					messages.map((m) => (
						<ChatMessage key={m.id || `msg-${Math.random()}`} message={m} />
					))
				)}
			</div>
			<div className="p-4 border-t bg-background">
				<ChatInput
					input={input}
					handleInputChange={handleInputChange}
					handleSubmit={handleSubmit}
					isLoading={isLoading}
				/>
			</div>
		</Card>
	);
}
