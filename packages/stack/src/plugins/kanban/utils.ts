/**
 * Slugify a string for use in URLs
 * @param text - The text to slugify
 * @returns A URL-safe slug
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "") // Remove non-word characters
		.replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
		.replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Generate a unique slug by appending a random suffix
 * @param baseSlug - The base slug
 * @returns A unique slug with random suffix
 */
export function generateUniqueSlug(baseSlug: string): string {
	const randomSuffix = Math.random().toString(36).substring(2, 8);
	return `${baseSlug}-${randomSuffix}`;
}

/**
 * Calculate the next order value for a list of items
 * @param items - Array of items with order property
 * @returns The next order value
 */
export function getNextOrder(items: { order: number }[]): number {
	if (items.length === 0) return 0;
	return Math.max(...items.map((item) => item.order)) + 1;
}

/**
 * Reorder items by swapping positions
 * @param items - Array of items to reorder
 * @param fromIndex - Original index
 * @param toIndex - Target index
 * @returns Reordered array with updated order values
 */
export function reorderItems<T extends { id: string; order: number }>(
	items: T[],
	fromIndex: number,
	toIndex: number,
): T[] {
	const result = [...items];
	const [removed] = result.splice(fromIndex, 1);
	if (removed) {
		result.splice(toIndex, 0, removed);
	}
	return result.map((item, index) => ({ ...item, order: index }));
}

/**
 * Get priority display configuration
 * @param priority - Priority level
 * @returns Display configuration for the priority
 */
export function getPriorityConfig(priority: string): {
	label: string;
	variant: "default" | "secondary" | "destructive" | "outline";
	className: string;
} {
	switch (priority) {
		case "URGENT":
			return {
				label: "Urgent",
				variant: "destructive",
				className: "kanban-priority-urgent",
			};
		case "HIGH":
			return {
				label: "High",
				variant: "outline",
				className: "kanban-priority-high",
			};
		case "MEDIUM":
			return {
				label: "Medium",
				variant: "default",
				className: "kanban-priority-medium",
			};
		case "LOW":
			return {
				label: "Low",
				variant: "secondary",
				className: "kanban-priority-low",
			};
		default:
			return {
				label: "Medium",
				variant: "default",
				className: "kanban-priority-medium",
			};
	}
}

/**
 * Priority options for forms
 */
export const PRIORITY_OPTIONS = [
	{ value: "LOW", label: "Low" },
	{ value: "MEDIUM", label: "Medium" },
	{ value: "HIGH", label: "High" },
	{ value: "URGENT", label: "Urgent" },
] as const;
