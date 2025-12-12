export type Conversation = {
	id: string;
	userId?: string;
	title: string;
	createdAt: Date;
	updatedAt: Date;
};

export type Message = {
	id: string;
	conversationId: string;
	role: "system" | "user" | "assistant" | "data";
	content: string;
	createdAt: Date;
};

export interface SerializedConversation
	extends Omit<Conversation, "createdAt" | "updatedAt"> {
	createdAt: string;
	updatedAt: string;
}

export interface SerializedMessage extends Omit<Message, "createdAt"> {
	createdAt: string;
}
