import type { KanbanUser } from "@btst/stack/plugins/kanban/client";

/**
 * Mock users for development and E2E testing
 * These users are used to demonstrate the assignee functionality
 */
export const MOCK_USERS: KanbanUser[] = [
	{
		id: "user-1",
		name: "Alice Johnson",
		email: "alice@example.com",
		avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=alice",
	},
	{
		id: "user-2",
		name: "Bob Smith",
		email: "bob@example.com",
		avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=bob",
	},
	{
		id: "user-3",
		name: "Carol Williams",
		email: "carol@example.com",
		avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=carol",
	},
	{
		id: "user-4",
		name: "David Brown",
		email: "david@example.com",
		avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=david",
	},
];

/**
 * Resolve a user by their ID
 * Returns null if user is not found
 */
export function resolveUser(userId: string): KanbanUser | null {
	return MOCK_USERS.find((u) => u.id === userId) ?? null;
}

/**
 * Search users by name or email
 * Returns all users if query is empty
 */
export function searchUsers(query: string): KanbanUser[] {
	if (!query) return MOCK_USERS;
	const lower = query.toLowerCase();
	return MOCK_USERS.filter(
		(u) =>
			u.name.toLowerCase().includes(lower) ||
			u.email?.toLowerCase().includes(lower),
	);
}
