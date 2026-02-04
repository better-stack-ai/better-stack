export interface KanbanCommonLocalization {
	// Navigation
	backToBoards: string;
	// Actions
	actions: string;
	create: string;
	edit: string;
	delete: string;
	cancel: string;
	save: string;
	// Status
	loading: string;
	saving: string;
	deleting: string;
	// Labels
	board: string;
	boards: string;
	column: string;
	columns: string;
	task: string;
	tasks: string;
	// Priorities
	priorityLow: string;
	priorityMedium: string;
	priorityHigh: string;
	priorityUrgent: string;
	// Empty states
	noBoards: string;
	noColumns: string;
	noTasks: string;
	// Errors
	errorGeneric: string;
	errorNotFound: string;
}

export const defaultKanbanCommonLocalization: KanbanCommonLocalization = {
	// Navigation
	backToBoards: "Back to Boards",
	// Actions
	actions: "Actions",
	create: "Create",
	edit: "Edit",
	delete: "Delete",
	cancel: "Cancel",
	save: "Save",
	// Status
	loading: "Loading...",
	saving: "Saving...",
	deleting: "Deleting...",
	// Labels
	board: "Board",
	boards: "Boards",
	column: "Column",
	columns: "Columns",
	task: "Task",
	tasks: "Tasks",
	// Priorities
	priorityLow: "Low",
	priorityMedium: "Medium",
	priorityHigh: "High",
	priorityUrgent: "Urgent",
	// Empty states
	noBoards: "No boards yet",
	noColumns: "No columns yet",
	noTasks: "No tasks yet",
	// Errors
	errorGeneric: "Something went wrong",
	errorNotFound: "Not found",
};
