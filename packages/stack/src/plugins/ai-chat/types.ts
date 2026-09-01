export type Conversation = {
	id: string;
	userId?: string;
	title: string;
	createdAt: Date;
	updatedAt: Date;
};

export type ConversationWithMessages = Conversation & {
	message?: Message[];
};

export type Message = {
	id: string;
	conversationId: string;
	role: "system" | "user" | "assistant" | "data";
	content: string;
	createdAt: Date;
};

export type SerializedConversation = Omit<
	Conversation,
	"createdAt" | "updatedAt"
> & {
	createdAt: string;
	updatedAt: string;
};

export type SerializedMessage = Omit<Message, "createdAt"> & {
	createdAt: string;
};
